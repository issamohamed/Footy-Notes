"""Stage P3 (optional, additive): fetch confirmed transfers from API-Football
once per pipeline run and bake them into each club JSON. This spends the API
quota at build time (about 96 calls per run) instead of per visitor, so the
frontend serves transfers as static JSON with zero runtime API calls.

Run:  API_FOOTBALL_KEY=xxxx python pipeline/transfers.py

Behaviour:
  - No key set  -> prints a notice and exits 0, leaving transfers as [] (the
    frontend already handles the empty state). The core app never depends on it.
  - Key set     -> reads clubId -> API-Football teamId from api_football_ids.json,
    calls /transfers?team={id} throttled to <=10 req/min, caches raw responses to
    .cache/transfers/, normalises to {player, direction, otherClub, date, fee},
    keeps the most recent N, and writes them into frontend/public/data/clubs/{id}.json.

Quota safety: checks the free /status endpoint first (does not count against the
daily limit) and aborts cleanly if remaining calls are too few. Throttles to the
10/min limit. See the README for the full reasoning.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from common import DATA_OUT, CACHE_DIR, PIPELINE_DIR

API_BASE = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
IDS_SEED = PIPELINE_DIR / "api_football_ids.json"
TRANSFER_CACHE = CACHE_DIR / "transfers"
KEEP_N = 8
THROTTLE_SECONDS = 7  # <=10 requests/minute
MIN_REMAINING = 15    # abort if the daily quota is nearly spent


def _api_get(path: str) -> dict:
    req = Request(f"{API_BASE}{path}", headers={"x-apisports-key": KEY})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _check_quota() -> None:
    """The /status endpoint reports remaining calls and does not count against
    the daily limit."""
    try:
        data = _api_get("/status")
        current = data.get("response", {}).get("requests", {}).get("current")
        limit = data.get("response", {}).get("requests", {}).get("limit_day")
        if current is not None and limit is not None:
            remaining = limit - current
            print(f"API-Football quota: {current}/{limit} used, {remaining} remaining today.")
            if remaining < MIN_REMAINING:
                sys.exit(f"Aborting: only {remaining} calls left today; run again after 00:00 UTC "
                         "or split across two days.")
    except (HTTPError, URLError, KeyError) as e:
        sys.exit(f"Could not reach API-Football /status: {e}. Check the key.")


def _normalise(raw: dict) -> list[dict]:
    """Flatten one team's /transfers response into recent {player, direction,
    otherClub, date, fee} rows, newest first."""
    rows: list[dict] = []
    for player_block in raw.get("response", []):
        player = (player_block.get("player") or {}).get("name")
        for tr in player_block.get("transfers", []):
            teams = tr.get("teams", {})
            in_team = (teams.get("in") or {}).get("name")
            out_team = (teams.get("out") or {}).get("name")
            rows.append({
                "player": player,
                "_in": in_team,
                "_out": out_team,
                "date": tr.get("date"),
                "fee": tr.get("type"),  # API-Football puts "Free"/"$x"/"Loan" here
            })
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return rows


def _direction_rows(rows: list[dict], club_name: str) -> list[dict]:
    """Tag each row in/out relative to this club and drop internal fields."""
    out: list[dict] = []
    for r in rows:
        direction = "in" if r["_in"] == club_name else "out"
        other = r["_out"] if direction == "in" else r["_in"]
        out.append({
            "player": r["player"],
            "direction": direction,
            "otherClub": other,
            "date": r["date"],
            "fee": r["fee"] if r["fee"] and r["fee"] != "N/A" else None,
        })
    return out[:KEEP_N]


def run() -> None:
    if not KEY:
        print("No API_FOOTBALL_KEY set. Skipping transfers (they stay empty; the "
              "frontend shows the empty state). This stage is optional.")
        return
    if not IDS_SEED.exists():
        sys.exit(f"{IDS_SEED.name} not found. Populate clubId -> API-Football teamId first.")

    ids: dict[str, int] = {k: v for k, v in json.loads(IDS_SEED.read_text()).items() if v}
    if not ids:
        print("api_football_ids.json has no team ids yet; nothing to fetch. "
              "Add clubId -> teamId entries to enable transfers.")
        return

    TRANSFER_CACHE.mkdir(parents=True, exist_ok=True)
    _check_quota()

    clubs_dir = DATA_OUT / "clubs"
    written = 0
    for i, (club_id, team_id) in enumerate(ids.items()):
        club_path = clubs_dir / f"{club_id}.json"
        if not club_path.exists():
            print(f"  skip {club_id}: no club JSON (run export.py first)")
            continue

        cache_path = TRANSFER_CACHE / f"{team_id}.json"
        if cache_path.exists():
            raw = json.loads(cache_path.read_text())
        else:
            if i > 0:
                time.sleep(THROTTLE_SECONDS)
            try:
                raw = _api_get(f"/transfers?team={team_id}")
            except (HTTPError, URLError) as e:
                print(f"  warn {club_id}: fetch failed ({e}); leaving transfers empty")
                continue
            cache_path.write_text(json.dumps(raw))

        club = json.loads(club_path.read_text())
        club["transfers"] = _direction_rows(_normalise(raw), club["name"])
        club_path.write_text(json.dumps(club, ensure_ascii=False, separators=(",", ":")))
        written += 1
        print(f"  {club_id}: {len(club['transfers'])} transfers")

    print(f"\nStage P3 complete: baked transfers into {written} club files.")


if __name__ == "__main__":
    run()
