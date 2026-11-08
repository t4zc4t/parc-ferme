"""Real HTML for every race and driver page, plus the sitemap, written at build time.

The pages still draw everything with JavaScript, but search engines and link previews
get a proper title, description and a plain result summary without running any.
"""
import json
from datetime import date
from html import escape
from pathlib import Path

SITE = "https://parc-ferme.pages.dev"
ROOT = Path(__file__).resolve().parent.parent / "site"
DATA = ROOT / "data"
DEFAULT_IMAGE = f"{SITE}/assets/share.png"
STATIC = ["", "standings", "schedule", "trivia", "drivers", "teams", "circuits", "wrapped", "compare", "races", "questions", "studies"]


def read(p):
    return json.loads(Path(p).read_text())


def long_date(iso):
    if not iso:
        return ""
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


def image(rel):
    """a share image drawn for this page, else the site's own"""
    return f"{SITE}/data/og/{rel}" if (DATA / "og" / rel).exists() else f"{SITE}/assets/share.png"


def fill(template, url, title, desc, h1_id, h1, extra_head="", swap=None, static="", img=None):
    """drop page specific bits into a page shell"""
    t = template.replace('<meta name="robots" content="noindex">\n', "")
    t = t.replace(t[t.index("<title>"):t.index("</title>") + 8], f"<title>{escape(title)}</title>")
    start = t.index('<meta name="description"')
    t = t[:start] + f'<meta name="description" content="{escape(desc)}">' + t[t.index(">", start) + 1:]
    head = (f'<link rel="canonical" href="{SITE}{url}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:site_name" content="Parc Fermé">\n'
            f'<meta property="og:title" content="{escape(title)}">\n'
            f'<meta property="og:description" content="{escape(desc)}">\n'
            f'<meta property="og:url" content="{SITE}{url}">\n'
            f'<meta property="og:image" content="{img or DEFAULT_IMAGE}">\n'
            f'<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n' + extra_head)
    t = t.replace("</head>", head + "</head>", 1)
    t = t.replace(f'id="{h1_id}">Loading<', f'id="{h1_id}">{escape(h1)}<', 1)
    for old, new in (swap or {}).items():
        t = t.replace(old, new, 1)
    if static:
        t = t.replace("</main>", static + "\n</main>", 1)
    return t


def race_page(template, race, info):
    year, rnd = race["year"], race["round"]
    name, c = race["name"], race["circuit"]
    res = race["results"] or race.get("sprint") or []
    if not res and race.get("quali"):
        res = [dict(q, pos=str(q["pos"]), time=q.get("q3") or q.get("q2") or q.get("q1")) for q in race["quali"]]
    session = "race" if race["results"] else "sprint" if race.get("sprint") else "qualifying"
    win = res[0] if res else None
    podium = [r for r in res if r["pos"] in ("2", "3")]
    has = ["Full results"]
    if info.get("laps"):
        has.append("a lap-by-lap chart")
    if info.get("tyres"):
        has.append("tyre strategies")
    title = f"{year} {name}: results" + (", lap chart and tyres" if info.get("tyres") else
                                         " and lap chart" if info.get("laps") else "") + " · Parc Fermé"
    lead = {"race": "won the", "sprint": "won the sprint at the", "qualifying": "took pole for the"}[session]
    desc = (f"{win['name']} {lead} {year} {name} for {win['team']}"
            + (f", ahead of {' and '.join(r['name'] for r in podium)}" if podium else "")
            + ". " + (", ".join(has[:-1]) + " and " + has[-1] if len(has) > 1 else has[0]) + ".")
    where = f"{c['name']}, {c['locality']}, {c['country']} · {long_date(race.get('date'))}"
    event = {"@context": "https://schema.org", "@type": "SportsEvent", "name": f"{year} {name}",
             "startDate": race.get("date"), "sport": "Formula One",
             "location": {"@type": "Place", "name": c["name"],
                          "address": {"@type": "PostalAddress", "addressLocality": c["locality"],
                                      "addressCountry": c["country"]}}}
    rows = "".join(f"<tr><td>{escape(str(r['pos']))}</td><td>{escape(r['name'])}</td>"
                   f"<td>{escape(r['team'])}</td><td>{escape(r.get('time') or r.get('status') or '')}</td></tr>"
                   for r in res)
    static = (f'<section class="wrap block" id="static-summary">\n<h2>Result</h2>\n'
              f'<table class="results"><thead><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>TIME / STATUS</th>'
              f'</tr></thead><tbody>{rows}</tbody></table>\n</section>')
    return fill(template, f"/races/{year}/{rnd}", title, desc, "race-name", name,
                extra_head=f'<script type="application/ld+json">{json.dumps(event)}</script>\n',
                swap={'id="race-where"></p>': f'id="race-where">{escape(where)}</p>'}, static=static,
                img=image(f"races/{year}/{rnd}.png"))


def driver_page(template, d):
    c, s = d["career"], d["season"]
    title = f"{d['name']}: career stats and {s['year']} season · Parc Fermé"
    desc = (f"{d['name']} drives for {d['team']}. {c['races']} Grands Prix, {c['wins']} wins, {c['podiums']} podiums, "
            f"{c['poles']} poles" + (f" and {c['titles']} world titles" if c["titles"] > 1 else
                                     " and a world title" if c["titles"] else "")
            + f". P{s['pos']} in {s['year']} with {s['points']} points so far.")
    person = {"@context": "https://schema.org", "@type": "Person", "name": d["name"], "jobTitle": "Racing driver",
              "memberOf": {"@type": "SportsTeam", "name": d["team"]}}
    static = (f'<section class="wrap block" id="static-summary"><p class="lede">{escape(desc)}</p></section>')
    return fill(template, f"/drivers/{d['id']}", title, desc, "d-last", d["last"],
                extra_head=f'<script type="application/ld+json">{json.dumps(person)}</script>\n',
                swap={'id="d-first"></span>': f'id="d-first">{escape(d["first"])}</span>'}, static=static,
                img=image(f"drivers/{d['id']}.png"))


def plural(n, word):
    return f"{n} {word}" + ("" if n == 1 else "s")


def circuit_page(template, c):
    where = ", ".join(x for x in (c.get("locality"), c.get("country")) if x)
    span = str(c["first"]) if c["first"] == c["last"] else f"{c['first']} to {c['last']}"
    title = f"{c['name']}: every F1 winner and record · Parc Fermé"
    desc = f"{c['name']} in {where} has held {plural(c['held'], 'championship race')}, {span}."
    if c["topDrivers"]:
        t = c["topDrivers"][0]
        desc += f" {t['name']} has won there the most, {plural(t['wins'], 'time')}."
    if c["races"] and c["races"][0]["winner"]:
        desc += f" Last winner: {c['races'][0]['winner']['name']} in {c['races'][0]['year']}."
    rows = "".join(f"<tr><td>{r['year']}</td><td>{escape(r['winner']['name']) if r['winner'] else ''}</td>"
                   f"<td>{escape(r['winner']['team']) if r['winner'] else ''}</td></tr>" for r in c["races"])
    static = (f'<section class="wrap block" id="static-summary">\n<h2>Winners</h2>\n<table><thead><tr><th>YEAR</th>'
              f'<th>WINNER</th><th>TEAM</th></tr></thead><tbody>{rows}</tbody></table>\n</section>')
    return fill(template, f"/circuits/{c['id']}", title, desc, "c-name", c["name"], static=static)


def team_page(template, t):
    span = str(t["first"]) if t["first"] == t["last"] else f"{t['first']} to {t['last']}"
    title = f"{t['name']}: F1 wins, titles and drivers · Parc Fermé"
    desc = (f"{t['name']} raced in Formula 1 from {span}: {plural(t['entries'], 'race')}, {plural(t['wins'], 'win')}, "
            f"{plural(t['poles'], 'pole')}")
    if t["titles"]:
        n = len(t["titles"])
        desc += f" and {n} constructors' title" + ("" if n == 1 else "s")
    desc += "."
    static = f'<section class="wrap block" id="static-summary"><p class="lede">{escape(desc)}</p></section>'
    return fill(template, f"/teams/{t['id']}", title, desc, "t-name", t["name"], static=static)


def career_page(template, p):
    yrs = [s["year"] for s in p["seasons"]]
    span = str(yrs[0]) if yrs[0] == yrs[-1] else f"{yrs[0]} to {yrs[-1]}"
    title = f"{p['name']}: F1 career, wins and seasons · Parc Fermé"
    desc = (f"{p['name']} raced in Formula 1 from {span} for {', '.join(t['name'] for t in p['teams'][:4])}. "
            f"{plural(p['starts'], 'start')}, {plural(p['wins'], 'win')}, {plural(p['podiums'], 'podium')}")
    if p["titles"]:
        desc += f" and {plural(len(p['titles']), 'world title')}"
    desc += "."
    person = {"@context": "https://schema.org", "@type": "Person", "name": p["name"], "jobTitle": "Racing driver"}
    static = f'<section class="wrap block" id="static-summary"><p class="lede">{escape(desc)}</p></section>'
    return fill(template, f"/drivers/{p['id']}", title, desc, "p-name", p["name"],
                extra_head=f'<script type="application/ld+json">{json.dumps(person)}</script>\n', static=static)


def build():
    urls = [f"{SITE}/{p}" for p in STATIC]
    race_tpl = (ROOT / "race.html").read_text()
    count = 0
    for y in read(DATA / "races" / "index.json")["years"]:
        season = read(DATA / "races" / f"{y['year']}.json")
        for info in season["rounds"]:
            src = DATA / "races" / str(y["year"]) / f"{info['round']}.json"
            if not (info.get("winner") or info.get("page")) or not src.exists():
                continue
            out = ROOT / "races" / str(y["year"]) / f"{info['round']}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(race_page(race_tpl, read(src), info))
            urls.append(f"{SITE}/races/{y['year']}/{info['round']}")
            count += 1
    driver_tpl = (ROOT / "driver.html").read_text()
    for d in read(DATA / "drivers.json")["drivers"]:
        src = DATA / "drivers" / f"{d['id']}.json"
        if not src.exists():
            continue
        out = ROOT / "drivers" / f"{d['id']}.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(driver_page(driver_tpl, read(src)))
        urls.append(f"{SITE}/drivers/{d['id']}")
        count += 1
    grid = {d["id"] for d in read(DATA / "drivers.json")["drivers"]}
    for kind, tpl, fn, url in (("circuits", "circuit.html", circuit_page, "circuits"),
                               ("teams", "team.html", team_page, "teams")):
        template = (ROOT / tpl).read_text()
        if not (DATA / kind / "index.json").exists():
            continue
        for x in read(DATA / kind / "index.json")[kind]:
            out = ROOT / url / f"{x['id']}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(fn(template, read(DATA / kind / f"{x['id']}.json")))
            urls.append(f"{SITE}/{url}/{x['id']}")
            count += 1
    career_tpl = (ROOT / "career.html").read_text()
    for src in sorted((DATA / "careers").glob("*.json")):
        if src.stem in grid:
            continue
        out = ROOT / "drivers" / f"{src.stem}.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(career_page(career_tpl, read(src)))
        urls.append(f"{SITE}/drivers/{src.stem}")
        count += 1
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    print(f"wrote {count} pages and a sitemap of {len(urls)} links")
