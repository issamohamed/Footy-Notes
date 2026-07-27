"""Stage P1: pull raw season data from Understat (via soccerdata) and cache it.

Run:  python pipeline/scrape.py

Pulls, for all five Big Five leagues and one season:
  - player season stats (minutes, goals, assists, xG, xA, npxG, shots, key passes, position)
  - team match stats   (per match points, xG, xGA, npxG, PPDA, deep completions)

soccerdata caches the raw HTTP responses under .cache/ automatically, so re-runs
do not re-hit Understat. We additionally snapshot the tidy DataFrames to
.cache/raw/*.parquet so transform.py can run without any network access.

Validation gate: prints per league team + player counts and asserts every club
has more than 18 players. Fails loudly otherwise.
"""

from __future__ import annotations

import sys

import pandas as pd
import soccerdata as sd

from common import CACHE_DIR, LEAGUES, RAW_DIR, SEASON


def scrape() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Pulling Understat data for season {SEASON}")
    print(f"Leagues: {', '.join(LEAGUES)}\n")

    us = sd.Understat(leagues=LEAGUES, seasons=SEASON, data_dir=CACHE_DIR)

    print("Reading player season stats ...")
    players = us.read_player_season_stats().reset_index()
    print("Reading team match stats ...")
    team_matches = us.read_team_match_stats().reset_index()

    # Snapshot tidy frames for the offline transform step (pickle keeps dtypes,
    # needs no extra engine dependency).
    players.to_pickle(RAW_DIR / "players.pkl")
    team_matches.to_pickle(RAW_DIR / "team_matches.pkl")

    _validate(players, team_matches)

    print(f"\nRaw snapshots written to {RAW_DIR}")
    print("Stage P1 complete.")


def _validate(players: pd.DataFrame, team_matches: pd.DataFrame) -> None:
    print("\n--- validation gate: coverage ---")
    leagues = sorted(players["league"].unique())
    if len(leagues) != 5:
        sys.exit(f"FAIL: expected 5 leagues, got {len(leagues)}: {leagues}")

    problems = []
    for lg in leagues:
        lg_players = players[players["league"] == lg]
        per_club = lg_players.groupby("team")["player"].nunique()
        n_clubs = per_club.shape[0]
        min_squad = int(per_club.min())
        print(f"  {lg:22s} clubs={n_clubs:2d}  players={len(lg_players):4d}  "
              f"min squad={min_squad}")
        if min_squad <= 18:
            thin = per_club[per_club <= 18].to_dict()
            problems.append(f"{lg}: clubs with <=18 players: {thin}")

    matches = team_matches.shape[0]
    print(f"\n  team match rows: {matches}")

    if problems:
        print("\nFAIL: thin squads detected:")
        for p in problems:
            print("  " + p)
        sys.exit(1)

    print("\nPASS: 5 leagues, every club has more than 18 players.")


if __name__ == "__main__":
    scrape()
