"""Cloudflare build step: copy site files from the data branch. No API calls."""
import io
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

import pages

REPO = "t4zc4t/parc-ferme"
URL = f"https://codeload.github.com/{REPO}/tar.gz/refs/heads/data"
OUT = Path(__file__).resolve().parent.parent / "site" / "data"


def download():
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL, timeout=60) as res:
                return res.read()
        except Exception as err:
            if attempt == 3:
                sys.exit(f"could not download the data branch: {err}")
            time.sleep(5 * (attempt + 1))


MAX_FILE = 5 * 1024 * 1024      # no single data file is anywhere near this
ALLOWED = {".json"}


def safe_target(name):
    """None unless it's a json file under site/"""
    parts = Path(name).parts
    # skip the <repo>-data/ top folder
    if len(parts) < 3 or parts[1] != "site":
        return None
    rel = parts[2:]
    if any(p in ("", ".", "..") or "\\" in p or ":" in p for p in rel):
        return None
    target = OUT.joinpath(*rel).resolve()
    if OUT.resolve() not in target.parents or target.suffix not in ALLOWED:
        return None
    return target


def main():
    blob = download()
    count = 0
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            # plain files only, no links
            if not member.isfile() or member.size > MAX_FILE:
                continue
            target = safe_target(member.name)
            if target is None:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())
            count += 1
    if not (OUT / "home.json").exists():
        sys.exit("the data branch has no site files yet")
    print(f"copied {count} data files")
    pages.build()


if __name__ == "__main__":
    main()
