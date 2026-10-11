# Parc Fermé

A one-stop site for Grand Prix racing data. Standings, driver records, race data and studies on the questions fans keep arguing about, all in one place.

I'm building it one feature at a time. Right now the homepage has the live driver standings, the last race result and a countdown to the next race, and every driver on this year's grid has a page with their career numbers, how they finished each season, and the battle with their teammate this year. A head to head tool comes next, then a race explorer and the studies.

The site updates itself. Every time Cloudflare Pages builds it, `pipeline/build.py` pulls the current season and every current driver's career from the API and writes the data the pages read. A GitHub Action asks Cloudflare for a fresh build once a day, so after a race weekend the new standings are up by the next morning, and no data ever gets committed to the repo.

To run it locally, `python pipeline/build.py` writes everything into `site/data/` (it takes a minute or two, since it makes a request per driver and per season), then any static server pointed at `site/` shows the page. It only uses the Python standard library, so there's nothing to install.

## Data

Results, standings and the calendar come from the Jolpica API, which carries on the old Ergast database. Lap times, tyre stints and pit stops will come from the FastF1 library.

## Folders

```
pipeline/       the data step Cloudflare runs on each build
  api.py        talks to the API, pages through long result lists
  home.py       next race, standings, last race
  drivers.py    one file per driver
site/           the pages Cloudflare Pages serves
site/assets/    styles, script and icon
site/data/      written by the build, not kept in git
site/_redirects sends /drivers/<name> to the driver page
```

This is an independent, non-commercial fan project. It isn't associated with Formula 1 companies or any team.

## How some numbers are counted

Titles only count finished seasons, so a driver leading the current season isn't a champion yet. Poles are first place in qualifying, which isn't always the grid slot after penalties. The teammate battle only counts rounds where both cars were in the race, and the team's finishing order decides it, so a retirement counts as a loss.
