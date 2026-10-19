# Parc Fermé

A one-stop site for Grand Prix racing data. Standings, driver records, race data and studies on the questions fans keep arguing about, all in one place.

I'm building it one feature at a time. Right now the homepage has the driver and team standings, the last race result and a countdown to the next session, the schedule page has every session of every weekend in your own time zone, and every driver on this year's grid has a page with their career numbers, how they finished each season, and the battle with their teammate this year. The compare page puts any two drivers since 1950 side by side, careers, title finishes by season, and every race they had against each other or as teammates. The race explorer has every Grand Prix since 1950, with a lap chart, gaps and lap times from 1996 and tyre strategies, safety cars and weather from 2023. The questions page answers eleven things people ask about the current era, like whether Antonelli will be the youngest champion or whether Hamilton's move to Ferrari worked, and the answers update after every race. The studies page has the longer reads, how much the car decides compared with the driver, and how retirements almost vanished from racing. The pages link into each other, so a result leads to its race, a driver to their rivals, and so on.

## How the data stays up to date

I didn't want the site to depend on someone else's API being up, so it keeps its own copy of the data on the repo's `data` branch. `archive/` has every finished season back to 1950, one file each, written once and never touched again. `current/` has the season in progress. `site/` holds the files the pages actually read, generated from the other two.

The updater is a GitHub Action. GitHub's own schedule is best effort and can skip hours at a time, so a tiny Cloudflare Worker (`worker/timer.js`) starts it every 10 minutes instead, with GitHub's schedule kept as an hourly backup. Almost every run ends straight away without touching the API. It knows the time of every session from the calendar, so it only starts checking once a qualifying, sprint or race is over, with one tiny request to see if the result is out. For the first 6 hours after a session it checks every run, then once an hour for two days. There's also one full check a day to catch penalties and calendar changes. When something new shows up it fetches the season, rebuilds the site files, commits them to the `data` branch and asks Cloudflare for a single build. If nothing changed, nothing gets committed or built.

Cloudflare's build (`pipeline/build.py`) never calls the API either, it just copies the site files from the `data` branch. So an API outage can't break a deploy, the site keeps showing the last good data.

Once a month another Action saves Jolpica's full database dump as a release asset, as a backup of the backup. That same dump is where the lap-by-lap data comes from, so a second Action rebuilds the lap charts from it afterwards with no API calls at all. Races newer than the dump get their laps from the API a few hours after the flag, one race per run, and tyres, safety cars and weather come from OpenF1's free tier, which allows 30 requests a minute, so those calls are spaced two seconds apart.

## Limits I'm working within

The Jolpica API allows 4 requests a second and 500 an hour, shared by everyone on the same IP. A normal update is about 15 requests, and the one-time backfill of all 76 finished seasons was spread out at one request every 7.5 seconds to stay under the hourly cap. GitHub's scheduled runs often come late or not at all, which is why the Worker does the waking; Cloudflare's free plan gives it 100,000 runs a day and it uses 144. Cloudflare's free plan allows 500 builds a month, and this uses a handful per race weekend.

Live timing during sessions isn't free anywhere I've found, so for now the site updates after each session rather than during it.

## Security

Every GitHub Action is pinned to the exact commit of its latest release, not a tag that could be moved, and Dependabot opens a pull request when a new release comes out. Each workflow starts with no permissions and each job only gets what it needs, the code checkout doesn't keep the GitHub token on disk, and form inputs reach scripts through environment variables and get checked, never pasted into the shell. The only secret in the repo is the Cloudflare deploy hook, and only the update step sees it. The Worker holds one GitHub token, limited to this repo and to starting workflows, and it has no public URL.

The Cloudflare build checks every path in the archive it downloads, so nothing outside `site/data/` and nothing but JSON can be written. The updater refuses an API answer that has less data than the store already holds, so an outage or a half-broken response can't wipe anything. The site itself sends a strict content security policy (only its own scripts, plus Google Fonts), can't be framed, and is HTTPS only. All data goes into the page as text, never as HTML.

## Data

Results, qualifying, sprints, standings and the calendar come from the Jolpica API, which carries on the old Ergast database. Qualifying results are missing before 1994 and patchy from 1996 to 2002, so a pole is the fastest qualifier where those results exist and the driver starting from pole where they don't. Lap times and pit stops come from Jolpica too, from 1996 on. Tyre stints, safety cars and weather come from OpenF1, which starts in 2023. OpenF1 sometimes misses a pit stop, so stints are checked against Jolpica's pit stops and a stint with no recorded tyre shows as "not recorded".

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
  compare.py    the search list and a results file for every driver, for the compare page
  laps.py       lap positions, lap times and pit stops, from the dump or the API
  openf1.py     tyre stints, safety cars and weather from OpenF1, 2023 on
  races.py      the race explorer's files, one per race
  racedata.py   rebuilds all race data from the latest dump
  questions.py  the questions page, worked out from the store after every update
  studies.py    the studies page, from every season in the store
  update.py     the schedule-aware updater
  backfill.py   one-time fill of the archive
  build.py      what Cloudflare runs
site/           the pages Cloudflare Pages serves
site/assets/    styles, scripts and icon
site/_redirects sends /drivers/<name> and /races/<year>/<round> to their pages
.github/workflows/
  update.yml    started every 10 minutes, does nothing unless a session just ended or the daily check is due
  backfill.yml  run by hand to fill the archive
  backup.yml    monthly copy of the full database dump
  racedata.yml  after each backup, rebuilds the lap charts and fills in OpenF1 data
worker/
  timer.js      Cloudflare Worker cron that starts update.yml
```

## How some numbers are counted

The title fight works in two layers. The maths is exact: it adds up the points still on offer in the races and sprints left, using the season's own scoring read from the results, and anyone who can't reach the leader's current total is out. The chances come from replaying the rest of the season 10,000 times, where each driver's finishing spot in every race is drawn from their own results this season, recent ones weighted a little more, with a retirement chance based on their record. The seed comes from the data, so the same results always give the same numbers. It's a guide to the maths, not a prediction, so nobody shows 0% while they can still mathematically win and nobody shows 100% until it's settled. The same runs give everyone's chance of a top 3 finish. Who's locked into the top 3 or can't reach it is exact maths, and the "guaranteed with N more points" line counts the fact that rivals share the points on offer, so three of them can't all win the same race.

Titles only count finished seasons, so a driver leading the current season isn't a champion yet. Poles are counted as being fastest in qualifying, so they can differ by a few from the official record, which takes away poles after exclusions and gave them to the sprint winner on the 2021 sprint weekends. Hamilton, for example, shows 107 here against an official 104. The teammate battle only counts rounds where both cars were in the race, and the team's finishing order decides it, so a retirement counts as a loss.

This is an independent, non-commercial fan project. It isn't associated with Formula 1 companies or any team.
