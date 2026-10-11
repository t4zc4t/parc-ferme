# Parc Fermé data

This branch is the site's own copy of the data, kept apart from the code on `main`.

`archive/` has one file per finished season, back to 1950, and never changes once written. `current/` has the season in progress, refreshed by the updater after each session. `site/` holds the files the website reads, rebuilt from the other two.

Everything here comes from the Jolpica API (the continuation of Ergast). The updater writes to this branch on its own, so its history doubles as a log of every data change.
