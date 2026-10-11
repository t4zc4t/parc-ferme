# Parc Fermé

A one-stop site for Grand Prix racing data. Standings, driver records, race data and studies on the questions fans keep arguing about, all in one place.

I'm building it one feature at a time. Right now the homepage has the driver and team standings, the last race result and a countdown to the next session, the schedule page has every session of every weekend in your own time zone, and every driver on this year's grid has a page with their career numbers, how they finished each season, and the battle with their teammate this year. A head to head tool comes next, then a race explorer and the studies.

## How the data stays up to date

I didn't want the site to depend on someone else's API being up, so it keeps its own copy of the data on the repo's `data` branch. `archive/` has every finished season back to 1950, one file each, written once and never touched again. `current/` has the season in progress. `site/` holds the files the pages actually read, generated from the other two.

The updater is a GitHub Action that wakes every 10 minutes, but almost every run ends straight away without touching the API. It knows the time of every session from the calendar, so it only starts checking once a qualifying, sprint or race is over, with one tiny request to see if the result is out. For the first 6 hours after a session it checks every run, then once an hour for two days. There's also one full check a day to catch penalties and calendar changes. When something new shows up it fetches the season, rebuilds the site files, commits them to the `data` branch and asks Cloudflare for a single build. If nothing changed, nothing gets committed or built.

Cloudflare's build (`pipeline/build.py`) never calls the API either, it just copies the site files from the `data` branch. So an API outage can't break a deploy, the site keeps showing the last good data.

Once a month another Action saves Jolpica's full database dump as a release asset, as a backup of the backup.

## Limits I'm working within

The Jolpica API allows 4 requests a second and 500 an hour, shared by everyone on the same IP. A normal update is about 15 requests, and the one-time backfill of all 76 finished seasons was spread out at one request every 7.5 seconds to stay under the hourly cap. GitHub only promises scheduled runs every 5 minutes at best and they often run late, which is fine since results take hours to appear anyway. Cloudflare's free plan allows 500 builds a month, and this uses a handful per race weekend.

Live timing during sessions isn't free anywhere I've found, so for now the site updates after each session rather than during it.

## Data

Results, qualifying, sprints, standings and the calendar come from the Jolpica API, which carries on the old Ergast database. Qualifying results only go back to 1994 there, so poles are counted from 1994 onwards, which covers every driver on the current grid. Practice results aren't in Jolpica at all, so those, plus lap times, tyre stints and pit stops, will come from the FastF1 library with the race explorer.

## Running it locally

Everything is plain Python 3 with no packages to install.

```
python pipeline/update.py      check for new data (set PF_FORCE=1 to fetch anyway)
python pipeline/backfill.py    fill in missing finished seasons, slowly
python pipeline/build.py       copy the site files from the data branch into site/data
```

`PF_STORE` points at a checkout of the `data` branch (by default `./store`). After `build.py`, any static server pointed at `site/` shows the site.

## Folders

```
pipeline/
  api.py        talks to the API, pages through long lists, waits when rate limited
  season.py     fetches one season into the format the store uses
  store.py      reads and writes the data branch
  sitegen.py    turns the store into the files the pages read, no API calls
  update.py     the schedule-aware updater
  backfill.py   one-time fill of the archive
  build.py      what Cloudflare runs
site/           the pages Cloudflare Pages serves
site/assets/    styles, scripts and icon
site/_redirects sends /drivers/<name> to the driver page
.github/workflows/
  update.yml    every 10 minutes, does nothing unless a session just ended or the daily check is due
  backfill.yml  run by hand to fill the archive
  backup.yml    monthly copy of the full database dump
```

## How some numbers are counted

The title fight works in two layers. The maths is exact: it adds up the points still on offer in the races and sprints left, using the season's own scoring read from the results, and anyone who can't reach the leader's current total is out. The chances come from replaying the rest of the season 10,000 times, where each driver's finishing spot in every race is drawn from their own results this season, recent ones weighted a little more, with a retirement chance based on their record. The seed comes from the data, so the same results always give the same numbers. It's a guide to the maths, not a prediction, so nobody shows 0% while they can still mathematically win and nobody shows 100% until it's settled.

Titles only count finished seasons, so a driver leading the current season isn't a champion yet. Poles are counted as being fastest in qualifying, so they can differ by a few from the official record, which takes away poles after exclusions and gave them to the sprint winner on the 2021 sprint weekends. Hamilton, for example, shows 107 here against an official 104. The teammate battle only counts rounds where both cars were in the race, and the team's finishing order decides it, so a retirement counts as a loss.

This is an independent, non-commercial fan project. It isn't associated with Formula 1 companies or any team.
