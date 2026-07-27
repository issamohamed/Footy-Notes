"""Stage P4: write the final JSON the frontend consumes, and validate it.

Run:  python pipeline/export.py   (runs transform.build_dataset internally)

Writes into frontend/public/data/:
  leagues.json          index of the five leagues
  clubs.json            LIGHT: one row per club, season aggregates only
  clubs/{clubId}.json   HEAVY: full roster + best XI + formation + transfers

Payload discipline (documented in the READMEs): the light file carries only the
headline metrics needed on first paint; rosters and transfers live in the heavy
per-club files, paid for only when a club is opened. Floats are already rounded
in transform.py. An optional pipeline/api_football_ids.json seed maps clubId ->
API-Football teamId for the (deferred) transfers stage; if absent, teamId stays
null and the frontend shows transfer empty states.

Validation gate: every bestXI.playerId must resolve to a real player in that
club's roster, and every club must expose an 11 slot best XI. Fails loudly.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from common import DATA_OUT, PIPELINE_DIR
from transform import build_dataset

API_IDS_SEED = PIPELINE_DIR / "api_football_ids.json"


def _load_api_ids() -> dict:
    if API_IDS_SEED.exists():
        try:
            return json.loads(API_IDS_SEED.read_text())
        except json.JSONDecodeError:
            print(f"WARN: {API_IDS_SEED.name} is not valid JSON; ignoring.")
    return {}


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def export() -> None:
    data = build_dataset()
    api_ids = _load_api_ids()

    # inject any known API-Football team ids into the light rows
    for club in data["clubs_light"]:
        if club["id"] in api_ids:
            club["teamId"] = api_ids[club["id"]]

    clubs_dir = DATA_OUT / "clubs"
    # clean stale per-club files so a rebuild never leaves orphans
    if clubs_dir.exists():
        for old in clubs_dir.glob("*.json"):
            old.unlink()

    _write_json(DATA_OUT / "leagues.json", data["leagues"])
    _write_json(DATA_OUT / "clubs.json", data["clubs_light"])
    for club_id, detail in data["clubs_detail"].items():
        # carry a known teamId onto the heavy file too (used by optional Function)
        detail["teamId"] = api_ids.get(club_id)
        _write_json(clubs_dir / f"{club_id}.json", detail)

    _validate(data)
    _report(data)


def _validate(data: dict) -> None:
    problems = []
    light_ids = {c["id"] for c in data["clubs_light"]}
    detail_ids = set(data["clubs_detail"])
    if light_ids != detail_ids:
        problems.append(f"light/heavy id mismatch: "
                        f"{light_ids ^ detail_ids}")

    for club_id, club in data["clubs_detail"].items():
        roster_ids = {p["id"] for p in club["players"]}
        if len(club["bestXI"]) != 11:
            problems.append(f"{club_id}: bestXI has {len(club['bestXI'])} slots")
        for slot in club["bestXI"]:
            if slot["playerId"] not in roster_ids:
                problems.append(
                    f"{club_id}: bestXI slot {slot['position']} -> "
                    f"unknown player {slot['playerId']}")

    if problems:
        print("\nVALIDATION FAILED:")
        for p in problems[:50]:
            print("  " + p)
        sys.exit(1)
    print("\nPASS: all bestXI playerIds resolve; every club has 11 slots; "
          "light and heavy club sets match.")


def _report(data: dict) -> None:
    clubs_dir = DATA_OUT / "clubs"
    light_bytes = (DATA_OUT / "clubs.json").stat().st_size
    heavy_sizes = [f.stat().st_size for f in clubs_dir.glob("*.json")]
    print(f"\nWrote {DATA_OUT}")
    print(f"  leagues.json  {len(data['leagues'])} leagues")
    print(f"  clubs.json    {len(data['clubs_light'])} clubs, "
          f"{light_bytes/1024:.1f} KB")
    print(f"  clubs/*.json  {len(heavy_sizes)} files, "
          f"avg {sum(heavy_sizes)/len(heavy_sizes)/1024:.1f} KB, "
          f"max {max(heavy_sizes)/1024:.1f} KB")
    print("Stage P4 complete.")


if __name__ == "__main__":
    export()
