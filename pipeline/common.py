"""Shared configuration and helpers for the footy_notes data pipeline.

Data provenance note: the original build brief specified FBref (via soccerdata)
as the primary source. FBref blocks automated access at the edge (HTTP 403) from
this environment, which is a hard blocker. We therefore pull from Understat (also
via soccerdata), a well established Expected Goals (xG) source that natively
carries the analyst fields this project needs: minutes, goals, assists, xG, xA,
non penalty xG, shots, key passes and coarse position, plus per match team xG,
xGA, points, PPDA and deep completions. The one FBref field Understat does not
carry is possession percentage, so we drop it in favour of a richer xG based set
(xG, xGA, npxG, expected points, PPDA). This is documented in the READMEs.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

# Season to build. Understat exposes this as the most recent complete campaign.
SEASON = "2025-2026"

# soccerdata league identifiers for the Big Five.
LEAGUES = [
    "ENG-Premier League",
    "ESP-La Liga",
    "ITA-Serie A",
    "GER-Bundesliga",
    "FRA-Ligue 1",
]

# Stable league metadata for leagues.json. Keyed by the soccerdata league name.
LEAGUE_META = {
    "ENG-Premier League": {"id": "eng-premier-league", "name": "Premier League", "country": "England"},
    "ESP-La Liga":        {"id": "esp-la-liga",        "name": "La Liga",        "country": "Spain"},
    "ITA-Serie A":        {"id": "ita-serie-a",        "name": "Serie A",        "country": "Italy"},
    "GER-Bundesliga":     {"id": "ger-bundesliga",     "name": "Bundesliga",     "country": "Germany"},
    "FRA-Ligue 1":        {"id": "fra-ligue-1",        "name": "Ligue 1",        "country": "France"},
}

# Repo paths.
PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parent
CACHE_DIR = REPO_ROOT / ".cache"
DATA_OUT = REPO_ROOT / "frontend" / "public" / "data"
RAW_DIR = CACHE_DIR / "raw"  # our own parquet snapshots of the soccerdata pulls


def slugify(name: str) -> str:
    """URL-safe, deterministic club id. 'Paris Saint Germain' -> 'paris-saint-germain'."""
    norm = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    norm = norm.lower().strip()
    norm = re.sub(r"[^a-z0-9]+", "-", norm)
    return norm.strip("-")


def player_slug(name: str) -> str:
    """Deterministic player id from name, e.g. 'Bukayo Saka' -> 'bukayo-saka'."""
    return slugify(name)
