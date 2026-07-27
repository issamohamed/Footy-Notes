# footy_notes

A coded, self-hosted tactical analytics dashboard for the Big Five European soccer leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1). Compare every club on its underlying numbers, then open any club for its player charts and a best XI laid out on a formation pitch.

This is a portfolio piece that replaces a Tableau deliverable. The point is that it is fully coded and reproducible from this repo: a Python pipeline scrapes and shapes the data into static JSON, and a React frontend is a pure static consumer of that JSON. No BI tool, no runtime database, no server for the core app.

**Live demo:** _add your Cloudflare Pages URL here_

## Screenshots

_Add three screenshots after your first deploy:_

- `docs/overview.png` : the club comparison scatter with the league toggle
- `docs/club.png` : a club dashboard (player charts + formation pitch)
- `docs/pitch.png` : a close up of the tactics board

## What it does

- **Overview (`/`)**: an editorial front page. A masthead with a search affordance, a league toggle, a headline strip of summary cells (total xG, highest scoring, tightest defence, best xG margin, club count), then a two-column composition: a minimal near-monochrome dot plot of all 96 clubs beside a ranked league table. On the scatter, attack (xG) rises up the chart and defence (xGA) improves to the right, with hairline reference lines at the league mean splitting the plot into "elite" and "struggling" quadrants; marks stay quiet until hovered, where the mark takes the accent, the rest dim, crosshair guides appear, and a tooltip opens; only the extreme clubs are labelled at rest. The league toggle ghosts the other leagues rather than hiding them, and it updates the toggle, scatter, headline strip, and table together. The table shows position, points, xG, xGA and a form sparkline per club; hovering a table row highlights the matching mark and vice versa. Either axis can be swapped to any of nine metrics. Every mark and every row is clickable.
- **Club search (command palette)**: press Cmd/Ctrl+K or `/` (or click the masthead search pill) on any page to jump straight to a club. Forgiving matching handles accents, substrings, initials and common shorthands (psg, man utd, gladbach, spurs, atleti); arrow keys move the highlight, Enter opens, Escape closes. Built as an accessible dialog (listbox, `aria-activedescendant`, focus trap, live region).
- **Club dashboard (`/club/:clubId`)**: a bento layout with deliberately varied cell sizes. A row of stat cards (points, goal difference, xG, xGA, xG margin), each with a season sparkline; the formation tactics board (the signature elevated surface) showing the best XI coloured by position group with per player stat cards on hover; an interactive player chart with two views, a minimal ranked bar chart (switch metric, filter by position line) and an "output vs expected" scatter (goals vs xG or assists vs xA) with a y=x reference line so over and under performers separate cleanly; a rolling five match form line chart of xG created vs conceded; and a bento of recent confirmed transfers.

## Architecture

```
FBref was the intended source but blocks automated access, so:

Understat (via soccerdata)  ->  Python pipeline  ->  static JSON  ->  React (Vite) frontend
                                (scrape/transform/export)   (committed)   (static consumer)

                                            + optional Cloudflare Pages Function for live transfer refresh
```

The core stats are a season snapshot, not a realtime feed, so the correct architecture is: run the pipeline offline, commit fresh JSON, and serve a static frontend. To refresh the data you re-run the pipeline. That is intentional, not a limitation.

The single dynamic piece, transfer news, is precomputed offline by default (baked into the club JSON), so visitors read it as static JSON with zero runtime API calls. An optional edge Function can refresh it live; see [Transfers](#transfers-optional).

## Data source and provenance

- **Source:** [Understat](https://understat.com) via the [`soccerdata`](https://github.com/probberechts/soccerdata) library. Understat is a well established Expected Goals (xG) provider covering the Big Five leagues.
- **Why not FBref:** the build brief specified FBref, but FBref blocks automated requests at the edge (HTTP 403) from this environment; that is a hard blocker. Understat carries the same analyst grade fields (minutes, goals, assists, xG, xA, non penalty xG, shots, key passes, coarse position) plus per match team xG, xGA, points, expected points, PPDA and deep completions. The one FBref field Understat lacks is possession percentage, which is dropped in favour of a richer xG based metric set.
- **Season:** 2025-2026 (most recent complete season). Set at the top of `pipeline/common.py`.
- **Captured:** July 2026. Re-run the pipeline to refresh.
- **Coverage:** 96 clubs, all five leagues, more than 18 players per club (asserted by the scrape validation gate).

### Headline club metrics (overview)

position, points, matches played, goals for, goals against, goal difference, xG, xGA, xG difference, expected points, PPDA. These are consistent across all clubs and chosen for meaningful club vs club comparison.

## Formation and best XI methodology (honest by design)

An interviewer will ask how the XI was chosen, so the method is deliberately defensible:

- **Best XI = minutes played.** For each slot in the club's formation, the highest minutes eligible player in that line is chosen. Minutes played is the cleanest proxy for "first choice selection" and avoids defending a composite rating.
- **Representative formation, not a match lineup.** The shape is inferred from how the club's outfield minutes split across lines. Because the source's coarse position tags cannot cleanly separate a full back from a wide midfielder, the defensive line is anchored at four and only escalated to five on a strong defensive minute signal; a back three is not inferred, since the data cannot reliably support it. The forward count comes from the forward minute share.
- **Position granularity.** Understat encodes positions at line level only (GK / DEF / MID / FWD), so left/right or centre assignment within a line (which centre back is "left", say) is by minutes and is presentational, not a claim from the data. This is stated in the club page UI.

These approximations are documented in `pipeline/transform.py` and surfaced in the app, so nothing is overstated.

## Run it

### Pipeline (Python)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt

python pipeline/scrape.py      # pull + cache Understat data, validation gate
python pipeline/transform.py   # (optional) print the best XI eyeball gate
python pipeline/export.py       # write leagues.json, clubs.json, clubs/{id}.json
```

Output lands in `frontend/public/data/` and is committed. `soccerdata` caches raw pulls under `.cache/`, so re-runs cost no network.

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
npm run build     # production build into frontend/dist
```

## Transfers (optional)

The transfer bento shows recent **confirmed** transfers from [API-Football](https://www.api-sports.io/documentation/football/v3). It is strictly additive: the club page renders fully without it.

- **Default (recommended): static.** `pipeline/transfers.py` spends the API quota once per pipeline run (about 96 calls, throttled to the free tier's 10/min limit) and bakes the results into each club JSON. Visitors then read transfers as static JSON with zero runtime API calls, zero exposed key, and the same architecture as every other stat. Set `API_FOOTBALL_KEY` and populate `pipeline/api_football_ids.json` (clubId to API-Football teamId), then run `python pipeline/transfers.py`. Without a key the stage no-ops and the UI shows a clean empty state.
- **Optional freshness layer:** `frontend/functions/api/transfers/[clubId].ts` is a Cloudflare Pages Function that refreshes a single club live, cached in KV with a long TTL and a daily budget guard. Enable it only if you want between-run freshness; see [Deploy](#deploy). The key is a Cloudflare secret and never reaches the browser.

**A cloner must supply their own free API-Football key.** No key ships in this repo.

## Deploy (Cloudflare Pages)

Static-only (recommended default):

- Build command: `npm run build`
- Build output directory: `frontend/dist`
- Root directory: `frontend`

Vite `base` is `/` because Cloudflare Pages serves from the root. `frontend/public/_redirects` handles SPA client routing.

To enable the optional transfer Function, see `wrangler.toml`: bind a `TRANSFERS_KV` namespace, set the `API_FOOTBALL_KEY` secret and the `CLUB_TEAM_IDS` env var (the JSON contents of `pipeline/api_football_ids.json`), and build with `VITE_ENABLE_TRANSFER_REFRESH=true`.

## Payload discipline

- `clubs.json` is the light first paint file: aggregates only, no rosters or transfers, plus a tiny per club form sparkline array (rolling xG margin) for the landing-page table rows. About 44 KB for 96 clubs, well inside a comfortable budget.
- `clubs/{id}.json` is heavy (full roster + best XI + per match rows + transfers) and loaded only when a club is opened (about 9 to 11 KB each), so its cost is paid per click. The per match rows (matchday, xG, xGA, points, opponent, result) power the form line chart and the stat card sparklines; about 38 small rows per club, a trivial addition.
- Per player fields are trimmed to what the charts use; floats are rounded to 1 to 2 decimals. Cloudflare gzips responses automatically.

## Known caveats

- **FBref rate limits / blocking:** FBref blocks automated access, which is why the pipeline uses Understat. Documented above.
- **Season snapshot, not live:** by design; the refresh path is re-running the pipeline.
- **Formation is an approximation:** representative shape with best XI by minutes, not a specific match lineup.
- **Position mapping:** line level only; lateral slotting within a line is presentational.
- **Transfers:** confirmed transfers captured at pipeline run time, capped by API-Football's free 100/day quota, spent offline. Not a live rumour feed. The club page works fully without it.

## Repo layout

```
footy_notes/
  pipeline/     Python: scrape.py, transform.py, transfers.py, export.py, common.py
  frontend/     React + TypeScript + Vite; D3 visualizations; public/data holds the JSON
    functions/  optional Cloudflare Pages Function for live transfer refresh
  wrangler.toml Cloudflare config for the optional Function
```
