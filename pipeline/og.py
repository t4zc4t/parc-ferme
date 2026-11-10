"""Share images: a 1200x630 card for each race of the current season and each driver on
the grid, plus a plain track outline per circuit for the bot. Written to site/og/ and
redrawn only when what they show changes. Needs Pillow; without it nothing is drawn.

  og/races/<year>/<round>.png   result or qualifying card
  og/drivers/<id>.png           driver card
  og/tracks/<circuit>.png       track outline, 600x600, transparent
  og/index.json                 what each image was drawn from, so unchanged ones are skipped
"""
import hashlib
import json
import re
from pathlib import Path

import store

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:      # the site still builds, links fall back to the default image
    Image = None

FONTS = Path(__file__).resolve().parent / "fonts"
W, H = 1200, 630
INK = (15, 13, 15)
PANEL = (22, 19, 21)
LINE = (53, 46, 51)
TEXT = (228, 221, 222)
SOFT = (184, 173, 176)
DIM = (148, 138, 142)
PINK = (220, 91, 102)
CYAN = (142, 178, 176)
AMBER = (220, 175, 102)
PODIUM = [PINK, CYAN, AMBER]


def font(kind, size):
    if kind == "mono":
        f = ImageFont.truetype(str(FONTS / "JetBrainsMono.ttf"), size)
        try:
            f.set_variation_by_axes([700])
        except (OSError, AttributeError):
            pass
        return f
    if kind == "serif":
        return ImageFont.truetype(str(FONTS / "ShipporiMinchoB1-ExtraBold.ttf"), size)
    name = "ZenKakuGothicNew-Bold.ttf" if kind == "bold" else "ZenKakuGothicNew-Regular.ttf"
    return ImageFont.truetype(str(FONTS / name), size)


def canvas():
    img = Image.new("RGB", (W, H), INK)
    glow = Image.new("RGB", (W, H), INK)
    g = ImageDraw.Draw(glow)
    g.ellipse((-260, -320, 640, 420), fill=(64, 18, 24))
    g.ellipse((780, 330, 1500, 900), fill=(30, 40, 40))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.9)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 6), fill=PINK)
    d.text((64, 52), "PARC FERMÉ", font=font("serif", 28), fill=TEXT)
    d.text((W - 64, 78), "parc-ferme.pages.dev", font=font("mono", 22), fill=DIM, anchor="rs")
    return img, d


def fit(d, text, kind, size, width, least=34):
    """the biggest size, down to a floor, at which the text fits on one line"""
    while size > least and d.textlength(text, font=font(kind, size)) > width:
        size -= 2
    return font(kind, size)


def track_points(path_d):
    """the svg path from the circuit files back into points in a 100 box"""
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", path_d or "")]
    return list(zip(nums[0::2], nums[1::2]))


def draw_track(img, points, box, color=PINK, width=6):
    if len(points) < 3:
        return
    x0, y0, x1, y1 = box
    side = min(x1 - x0, y1 - y0)
    ox, oy = x0 + (x1 - x0 - side) / 2, y0 + (y1 - y0 - side) / 2
    pts = [(ox + x / 100 * side, oy + y / 100 * side) for x, y in points]
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(pts + [pts[0]], fill=color + (150,), width=width * 3, joint="curve")
    img.paste(glow.filter(ImageFilter.GaussianBlur(10)), (0, 0), glow.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(img).line(pts + [pts[0]], fill=color, width=width, joint="curve")


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def race_card(race, track):
    img, d = canvas()
    year, rnd = race["year"], race["round"]
    rows, label = race["results"], "Race result"
    if not rows and race.get("sprint"):
        rows, label = race["sprint"], "Sprint result"
    if not rows and race.get("quali"):
        rows = [dict(q, pos=str(q["pos"]), time=q.get("q3") or q.get("q2") or q.get("q1")) for q in race["quali"]]
        label = "Qualifying"
    provisional = race.get("provisional") or (label == "Qualifying" and race.get("qualiProvisional"))
    d.text((64, 118), f"{year}  ·  ROUND {rnd}  ·  {label.upper()}" + ("  ·  PROVISIONAL" if provisional else ""),
           font=font("mono", 22), fill=PINK if provisional else SOFT)
    right = 760 if track else W - 64
    title = race["name"].replace(" Grand Prix", "")
    d.text((64, 150), title, font=fit(d, title, "serif", 84, right - 64), fill=TEXT)
    d.text((64, 252), "Grand Prix · " + race["circuit"]["name"], font=fit(d, "Grand Prix · " + race["circuit"]["name"], "reg", 28, right - 64, 20), fill=SOFT)
    top = rows[:3]
    y = 330
    for i, r in enumerate(top):
        d.rounded_rectangle((64, y, right, y + 76), radius=6, fill=PANEL, outline=LINE)
        d.rectangle((64, y, 70, y + 76), fill=PODIUM[i])
        d.text((96, y + 38), f"P{i + 1}", font=font("mono", 28), fill=PODIUM[i], anchor="lm")
        d.text((170, y + 38), r["name"], font=fit(d, r["name"], "bold", 34, right - 170 - 200, 22), fill=TEXT, anchor="lm")
        side = (r.get("time") or "") if i == 0 or label == "Qualifying" else (r.get("time") or r.get("status") or "")
        d.text((right - 24, y + (26 if side else 38)), r["team"], font=font("reg", 22), fill=DIM, anchor="rm")
        if side:
            d.text((right - 24, y + 54), side, font=font("mono", 22), fill=SOFT, anchor="rm")
        y += 88
    if track:
        draw_track(img, track, (800, 120, 1140, 520))
    return img


def driver_card(drv):
    img, d = canvas()
    c, s = drv["career"], drv["season"]
    d.text((64, 118), f"{drv.get('nationality') or ''}  ·  #{drv.get('number') or ''}  ·  {drv['team']}".upper().strip(" ·"),
           font=font("mono", 22), fill=SOFT)
    d.text((64, 150), drv["first"], font=font("reg", 44), fill=SOFT)
    d.text((64, 200), drv["last"], font=fit(d, drv["last"], "serif", 110, W - 128 - 230), fill=TEXT)
    if drv.get("number"):
        d.text((W - 64, 340), str(drv["number"]), font=font("serif", 200), fill=(44, 22, 26), anchor="rs")
    tiles = [("Season", f"P{s['pos']}" if s.get("pos") else "–", f"{s.get('points', 0)} pts in {s.get('year', '')}"),
             ("Wins", str(c["wins"]), "career"), ("Podiums", str(c["podiums"]), "career"),
             ("Poles", str(c["poles"]), "career"), ("Titles", str(c["titles"]), "world champion" if c["titles"] else "")]
    x, tw = 64, (W - 128 - 4 * 16) / 5
    for label, value, note in tiles:
        d.rounded_rectangle((x, 380, x + tw, 520), radius=6, fill=PANEL, outline=LINE)
        d.text((x + 20, 400), label, font=font("reg", 22), fill=DIM)
        d.text((x + 20, 430), value, font=font("serif", 52), fill=PINK if label == "Season" else TEXT)
        if note:
            d.text((x + 20, 496), note, font=fit(d, note, "reg", 18, tw - 30, 12), fill=SOFT)
        x += tw + 16
    return img


def track_png(points):
    img = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    ImageDraw.Draw(img).line([(30 + x / 100 * 540, 30 + y / 100 * 540) for x, y in points + points[:1]],
                             fill=PINK + (255,), width=10, joint="curve")
    return img


# bump when the look of the cards changes, so every image is drawn again
STYLE = "mafia-1"


def digest(*parts):
    return hashlib.sha1(json.dumps([STYLE, parts], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def build(out=None):
    """draw what changed, True if any image did"""
    if Image is None:
        print("share images skipped, Pillow is not installed")
        return False
    out = Path(out or store.ROOT / "site")
    folder = out / "og"
    index_path = folder / "index.json"
    try:
        seen = json.loads(index_path.read_text())
    except (FileNotFoundError, ValueError):
        seen = {}
    now = {}
    drawn = 0

    def need(key, *parts):
        h = digest(*parts)
        now[key] = h
        return seen.get(key) != h or not (folder / key).exists()

    circuits = {}
    try:
        for c in json.loads((out / "circuits" / "index.json").read_text())["circuits"]:
            if c.get("track"):
                circuits[c["id"]] = track_points(c["track"])
    except FileNotFoundError:
        pass

    for cid, pts in circuits.items():
        key = f"tracks/{cid}.png"
        if need(key, pts):
            save(track_png(pts), folder / key)
            drawn += 1

    try:
        season = json.loads((out / "drivers.json").read_text())["season"]
    except FileNotFoundError:
        return False
    for src in sorted((out / "races" / str(season)).glob("*.json"), key=lambda p: int(p.stem)):
        race = json.loads(src.read_text())
        if not (race.get("results") or race.get("sprint") or race.get("quali")):
            continue
        track = circuits.get(race["circuit"].get("id"))
        key = f"races/{season}/{src.stem}.png"
        show = {k: race.get(k) for k in ("name", "results", "sprint", "quali", "provisional", "qualiProvisional")}
        show["results"] = [{k: r.get(k) for k in ("name", "team", "time", "status")} for r in (show["results"] or [])[:3]]
        show["sprint"] = [{k: r.get(k) for k in ("name", "team", "time", "status")} for r in (show["sprint"] or [])[:3]]
        show["quali"] = [{k: r.get(k) for k in ("name", "team", "q1", "q2", "q3")} for r in (show["quali"] or [])[:3]]
        if need(key, show, track):
            save(race_card(race, track), folder / key)
            drawn += 1

    for src in sorted((out / "drivers").glob("*.json")):
        drv = json.loads(src.read_text())
        key = f"drivers/{src.stem}.png"
        c, s = drv["career"], drv["season"]
        if need(key, drv["name"], drv["team"], drv.get("number"), drv.get("nationality"),
                [c[k] for k in ("wins", "podiums", "poles", "titles")], [s.get(k) for k in ("pos", "points", "year")]):
            save(driver_card(drv), folder / key)
            drawn += 1

    # images whose page is gone
    for key in set(seen) - set(now):
        (folder / key).unlink(missing_ok=True)
    changed = store.write_json(index_path, now)
    if drawn:
        print(f"share images: drew {drawn}")
    return changed or bool(drawn)
