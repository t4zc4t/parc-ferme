# Parc Fermé

A one-stop site for Grand Prix racing data. Standings, driver records, race data and studies on the questions fans keep arguing about, all in one place.

I'm building it one feature at a time, so right now it's just the homepage. Live standings and the race calendar come next, then driver pages, a head to head tool, a race explorer, and the studies.

The plan is for the site to update itself after every race weekend. A scheduled job pulls the latest results, rebuilds the pages and deploys them, so the data stays current without me touching it.

## Data

Results, standings and the calendar come from the Jolpica API, which carries on the old Ergast database. Lap times, tyre stints and pit stops will come from the FastF1 library.

## Folders

```
site/           the pages Cloudflare Pages serves
site/assets/    styles, script and icon
```

This is an independent, non-commercial fan project. It isn't associated with Formula 1 companies or any team.
