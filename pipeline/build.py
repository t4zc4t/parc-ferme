"""Cloudflare Pages runs this on every build.

It doesn't call the F1 API at all. It downloads the site files the updater keeps
on the repo's `data` branch and drops them into site/data/. So a build can't fail
because the API is down, and every build shows exactly what the store holds.
"""
import io
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

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
    """Where a file from the archive may go, or None if it doesn't belong in site/data/.

    The archive comes over the network, so its paths are checked rather than trusted:
    nothing outside site/, no "..", no absolute paths, only JSON.
    """
    parts = Path(name).parts
    # the archive's top folder is <repo>-data/, we want what's under site/
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
            # regular files only: no links, devices or folders that could point elsewhere
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


if __name__ == "__main__":
    main()
