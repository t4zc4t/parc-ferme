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
STATIC = ["", "schedule", "drivers", "compare", "races", "questions", "studies"]


def read(p):
    return json.loads(Path(p).read_text())


def long_date(iso):
    if not iso:
        return ""
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


def fill(template, url, title, desc, h1_id, h1, extra_head="", swap=None, static=""):
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
            f'<meta property="og:image" content="{SITE}/assets/share.png">\n'
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
    res = race["results"]
    win = res[0] if res else None
    podium = [r for r in res if r["pos"] in ("2", "3")]
    has = ["Full results"]
    if info.get("laps"):
        has.append("a lap-by-lap chart")
    if info.get("tyres"):
        has.append("tyre strategies")
    title = f"{year} {name}: results" + (", lap chart and tyres" if info.get("tyres") else
                                         " and lap chart" if info.get("laps") else "") + " · Parc Fermé"
    desc = (f"{win['name']} won the {year} {name} for {win['team']}"
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
                swap={'id="race-where"></p>': f'id="race-where">{escape(where)}</p>'}, static=static)


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
                swap={'id="d-first"></span>': f'id="d-first">{escape(d["first"])}</span>'}, static=static)


def build():
    urls = [f"{SITE}/{p}" for p in STATIC]
    race_tpl = (ROOT / "race.html").read_text()
    count = 0
    for y in read(DATA / "races" / "index.json")["years"]:
        season = read(DATA / "races" / f"{y['year']}.json")
        for info in season["rounds"]:
            src = DATA / "races" / str(y["year"]) / f"{info['round']}.json"
            if not info.get("winner") or not src.exists():
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
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    print(f"wrote {count} pages and a sitemap of {len(urls)} links")
