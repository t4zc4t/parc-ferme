"""Tell Bing and the other IndexNow engines about pages that just changed."""
import json
import re
import urllib.request
from pathlib import Path

SITE = "https://parc-ferme.pages.dev"
SITE_DIR = Path(__file__).resolve().parent.parent / "site"


def key():
    for f in SITE_DIR.glob("*.txt"):
        if re.fullmatch(r"[0-9a-f]{32}", f.stem):
            return f.stem
    return None


def send(paths):
    """paths like /races/2026/20; best effort, never raises"""
    k = key()
    urls = sorted({SITE + p if p.startswith("/") else p for p in paths if p})
    if not k or not urls:
        return False
    body = json.dumps({"host": SITE.split("//")[1], "key": k, "keyLocation": f"{SITE}/{k}.txt", "urlList": urls[:500]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"indexnow: {r.status} for {len(urls)} pages")
            return r.status in (200, 202)
    except Exception as err:
        print(f"indexnow failed: {err}")
        return False
