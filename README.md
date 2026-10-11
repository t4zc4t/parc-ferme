# Parc Fermé

A one-stop site for Grand Prix racing data. Standings, driver records, race data and studies on the questions fans keep arguing about, all in one place.

I'm building it one feature at a time. Right now the homepage has the live driver standings and a countdown to the next race. Driver pages come next, then a head to head tool, a race explorer, and the studies.

The site updates itself. Every time Cloudflare Pages builds it, `pipeline/build.py` pulls the current season from the API and writes the data the pages read. A GitHub Action asks Cloudflare for a fresh build once a day, so after a race weekend the new standings are up by the next morning, and no data ever gets committed to the repo.

To run it locally, `python pipeline/build.py` writes `site/data/home.json`, then any static server pointed at `site/` shows the page. It only uses the Python standard library, so there's nothing to install.

## Data

Results, standings and the calendar come from the Jolpica API, which carries on the old Ergast database. Lap times, tyre stints and pit stops will come from the FastF1 library.

## Folders

```
pipeline/       the data step Cloudflare runs on each build
site/           the pages Cloudflare Pages serves
site/assets/    styles, script and icon
site/data/      written by the build, not kept in git
```

This is an independent, non-commercial fan project. It isn't associated with Formula 1 companies or any team.
