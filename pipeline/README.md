# footy_notes pipeline

The Python data layer. It scrapes one season of Big Five data, shapes it into the exact JSON the frontend consumes, and validates it at each stage. The frontend only plots data; all aggregation, ranking, best XI selection and formation coordinates are computed here and baked into the JSON.

## Stages

| Stage | File | What it does |
|-------|------|--------------|
| P1 | `scrape.py` | Pull player season stats and team match stats from Understat (via soccerdata) for all five leagues, cache them, assert coverage. |
| P2 | `transform.py` | Clean and aggregate; compute club season stats, per player stats, representative formation and best XI coordinates. |
| P3 | `transfers.py` | Optional: fetch confirmed transfers from API-Football and bake them into the club JSON. No-ops without a key. |
| P4 | `export.py` | Write `leagues.json`, the light `clubs.json`, and one heavy `clubs/{id}.json` per club; validate every best XI player resolves. |

`common.py` holds shared config (season, league list, paths, slug helpers).

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python scrape.py       # P1: pull + cache + validation gate
python transform.py    # P2: prints the best XI eyeball gate for a few known clubs
python export.py       # P4: writes JSON into ../frontend/public/data and validates

# optional:
API_FOOTBALL_KEY=xxxx python transfers.py   # P3: bake transfers (needs a key + id map)
```

`export.py` calls `transform.build_dataset()` internally, so P4 alone regenerates all JSON after a scrape.

## Data source

Understat via [`soccerdata`](https://github.com/probberechts/soccerdata). The brief specified FBref, but FBref blocks automated access at the edge (HTTP 403), a hard blocker, so the pipeline uses Understat, which carries the xG based analyst fields this project needs. See the root README for full provenance. Raw pulls are cached under `../.cache/` (gitignored), so re-runs cost no network.

## Validation gates

- **P1:** five leagues present, more than 18 players per club. Prints per league counts.
- **P2:** prints each watched club's formation and best XI so you can eyeball that, for example, no striker is in goal and no line is obviously wrong. Also checks every club has a full 11 slot XI with a real goalkeeper in the GK slot.
- **P4:** every `bestXI.playerId` resolves to a real player in that club's roster; the light and heavy club id sets match. Fails loudly otherwise.

## Methodology notes

- **Positions** are line level only in Understat (GK / DEF / MID / FWD). We take the most attacking token present as a player's line, because the source over-tags utility players as defenders. Pure substitute players (no recorded line) are labelled MID and are not best XI eligible.
- **Formation** is inferred from outfield minute shares. The defensive line is anchored at four and escalated to five only on a strong defensive signal; a back three is not inferred because the coarse tags cannot reliably support it. The forward count comes from the forward minute share. Unknown shapes fall back to 4-3-3 (flagged in the JSON as `formationIsFallback`).
- **Best XI** fills each formation slot with the highest minutes eligible player in that line. Left/right within a line is by minutes and is presentational.
- **Club aggregates** are computed by melting Understat's home/away match rows into per team per match rows, then grouping. League position is by points, then goal difference, then goals for.

## Transfers (P3)

`transfers.py` is offline and optional. With a key set it checks the free `/status` endpoint (which does not count against the daily limit), throttles to 10 requests/minute, caches raw responses under `../.cache/transfers/`, normalises to `{player, direction, otherClub, date, fee}`, keeps the most recent 8 per club, and writes them into the club JSON. Populate `api_football_ids.json` with `clubId -> API-Football teamId` first. Without a key it prints a notice and leaves transfers empty; the frontend shows a clean empty state.
