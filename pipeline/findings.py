"""The story of a race in a few cards, shown when a replay reaches the flag.

Everything comes from the race page itself: results, the order every lap, pit stops,
tyres and safety car periods. Each card is {k (short label), v (the headline), text}.
"""
from collections import Counter

TYRE = {"SOFT": "softs", "MEDIUM": "mediums", "HARD": "hards", "INTERMEDIATE": "inters", "WET": "wets"}


def lap_time(ms):
    m, s = divmod(ms / 1000, 60)
    return f"{int(m)}:{s:06.3f}"


def cards(page, names):
    res = page["results"]
    laps = page.get("drivers") or {}
    if not res or not laps:
        return []
    who = {r["id"]: r for r in res}
    short = lambda d: who[d]["name"].split()[-1] if d in who else names.code(d)
    out = []

    win = res[0]
    second = res[1] if len(res) > 1 else None
    gap = second["time"].lstrip("+") if second and (second.get("time") or "").startswith("+") else None
    grid = f"from P{win['grid']}" if win["grid"] else "from the pit lane"
    out.append({"k": "WINNER", "v": f"{win['name']}",
                "text": f"Won {grid} for {win['team']}" + (f", {gap}s ahead of {short(second['id'])}." if gap else ".")})

    # who led, lap by lap
    total = max(len(v) for v in laps.values())
    leaders = []
    for n in range(total):
        front = [d for d, v in laps.items() if n < len(v) and v[n][0] == 1]
        leaders.append(front[0] if front else None)
    led = Counter(d for d in leaders if d)
    changes = sum(1 for a, b in zip(leaders, leaders[1:]) if a and b and a != b)
    if led:
        top, n = led.most_common(1)[0]
        others = [f"{short(d)} {c}" for d, c in led.most_common()[1:3]]
        out.append({"k": "LAPS LED", "v": f"{short(top)} led {n} of {total}",
                    "text": (("The lead changed hands once." if changes == 1 else f"The lead changed hands {changes} times.")
                             + (f" Also led: {', '.join(others)}." if others else "")
                             if changes else "Nobody else led a lap.")})

    # places gained over the race
    climbs = [(r["grid"] - int(r["pos"]), r) for r in res if r["grid"] and str(r["pos"]).isdigit()]
    if climbs:
        n, r = max(climbs, key=lambda c: c[0])
        if n > 0:
            out.append({"k": "BIGGEST CLIMB", "v": f"{short(r['id'])} +{n}",
                        "text": f"Started P{r['grid']}, finished P{r['pos']}."})

    # passes at the line: two cars swap places and neither stopped around that lap
    pitted = {(p[0], n) for p in page.get("pits", []) for n in (p[1], p[1] + 1)}
    passes = Counter()
    for n in range(1, total):
        here = {d: v[n][0] for d, v in laps.items() if n < len(v)}
        before = {d: laps[d][n - 1][0] for d in here}
        for d in here:
            if (d, n + 1) in pitted or (d, n) in pitted:
                continue
            passes[d] += sum(1 for e in here if e != d and before[e] < before[d] and here[e] > here[d]
                             and (e, n + 1) not in pitted and (e, n) not in pitted)
    if passes:
        d, n = passes.most_common(1)[0]
        out.append({"k": "ON TRACK", "v": f"{short(d)} passed {n} cars",
                    "text": "Places won at the line each lap where neither car had just pitted, so mostly real overtakes."})

    # strategy that won it
    stints = (page.get("stints") or {}).get(win["id"])
    if stints:
        tyres = [TYRE.get(s[2]) for s in stints if TYRE.get(s[2])]
        # the official stops, openf1's stints sometimes split one
        stops = sum(1 for p in page.get("pits", []) if p[0] == win["id"] and (not p[3] or p[3] < 60000))
        plan = {0: "no stops", 1: "one stop", 2: "two stops"}.get(stops, f"{stops} stops")
        if tyres and stops == 0 and len(tyres) > 1:
            out.append({"k": "STRATEGY", "v": "Won without a pit stop",
                        "text": "Changed tyres during a red flag, " + ", then ".join(tyres) + "."})
        elif tyres:
            out.append({"k": "STRATEGY", "v": f"Won on {plan}",
                        "text": ", then ".join(tyres).capitalize() + "."})

    periods = page.get("periods") or []
    if periods:
        kinds = Counter(p[0] for p in periods)
        label = {"SC": "safety car", "VSC": "virtual safety car", "RED": "red flag"}
        bits = [f"{n} {label[k]}{'s' if n > 1 else ''}" for k, n in kinds.items() if k in label]
        span = ", ".join(f"laps {a}–{b}" if b > a else f"lap {a}" for _, a, b in periods)
        out.append({"k": "NEUTRALISED", "v": " and ".join(bits).capitalize(), "text": span.capitalize() + "."})
    else:
        out.append({"k": "NEUTRALISED", "v": "Green all the way", "text": "No safety car, virtual safety car or red flag."})

    # fastest lap and fastest stop
    best = min(((ms, d, n + 1) for d, v in laps.items() for n, (_, ms) in enumerate(v) if ms), default=None)
    if best:
        ms, d, n = best
        out.append({"k": "FASTEST LAP", "v": f"{short(d)} {lap_time(ms)}", "text": f"On lap {n}."})
    stops = [p for p in page.get("pits", []) if p[3] and p[3] < 60000]
    if stops:
        d, n, _, ms = min(stops, key=lambda p: p[3])
        out.append({"k": "QUICKEST STOP", "v": f"{short(d)} {ms / 1000:.1f}s", "text": f"Pit lane time, on lap {n}."})

    # longest run on one set
    longest = max(((b - a + 1, d, comp) for d, v in (page.get("stints") or {}).items()
                   for a, b, comp, _ in v if comp in TYRE), default=None)
    if longest:
        n, d, comp = longest
        out.append({"k": "LONGEST STINT", "v": f"{short(d)} {n} laps", "text": f"On {TYRE[comp]}."})
    return out
