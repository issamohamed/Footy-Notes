"""Stage P2: clean, aggregate and shape the raw Understat pull into the exact
structures the frontend consumes. All ranking, best XI selection and formation
coordinate assignment happen here so the frontend only ever plots data.

Run standalone to print the validation gate (per club formation + best XI):
    python pipeline/transform.py

export.py imports build_dataset() to write the JSON.

Position handling (documented caveat): Understat encodes positions at line level
only (GK / D / M / F), ordered most played first, with a trailing "S" marking
substitute appearances. We take the first non "S" token as a player's primary
line. Pure "S" players (fringe, sub only, no recorded line) are labelled MID and
are not eligible for the best XI. Because the source has no left/right or
centre granularity, best XI slots within a line are filled by minutes played;
the left/right position of, say, the two centre backs is presentational, not a
claim from the data. This is stated in the READMEs and the club page UI.

Formation is the club's representative shape, inferred from the line makeup of
its ten highest minute outfield players (its de facto first choice XI), snapped
to the nearest common template. Best XI = highest minutes player per line slot.
"""

from __future__ import annotations

import sys
from collections import defaultdict

import pandas as pd

from common import LEAGUE_META, RAW_DIR, player_slug, slugify

# --- formation templates -------------------------------------------------
# Coordinate system: x 0..100 left->right, y 0..100 own goal->opponent goal.
# GK near y=6, strikers near y=88. Each slot carries the line it belongs to so
# best XI filling can group by line (GK / DEF / MID / FWD).

FORMATION_TEMPLATES: dict[str, list[dict]] = {
    "4-3-3": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LB",  "line": "DEF", "x": 16, "y": 26},
        {"position": "LCB", "line": "DEF", "x": 38, "y": 18},
        {"position": "RCB", "line": "DEF", "x": 62, "y": 18},
        {"position": "RB",  "line": "DEF", "x": 84, "y": 26},
        {"position": "LCM", "line": "MID", "x": 32, "y": 48},
        {"position": "CM",  "line": "MID", "x": 50, "y": 44},
        {"position": "RCM", "line": "MID", "x": 68, "y": 48},
        {"position": "LW",  "line": "FWD", "x": 20, "y": 78},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 88},
        {"position": "RW",  "line": "FWD", "x": 80, "y": 78},
    ],
    "4-2-3-1": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LB",  "line": "DEF", "x": 16, "y": 26},
        {"position": "LCB", "line": "DEF", "x": 38, "y": 18},
        {"position": "RCB", "line": "DEF", "x": 62, "y": 18},
        {"position": "RB",  "line": "DEF", "x": 84, "y": 26},
        {"position": "LDM", "line": "MID", "x": 38, "y": 40},
        {"position": "RDM", "line": "MID", "x": 62, "y": 40},
        {"position": "LAM", "line": "MID", "x": 26, "y": 66},
        {"position": "CAM", "line": "MID", "x": 50, "y": 64},
        {"position": "RAM", "line": "MID", "x": 74, "y": 66},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 88},
    ],
    "4-4-2": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LB",  "line": "DEF", "x": 16, "y": 26},
        {"position": "LCB", "line": "DEF", "x": 38, "y": 18},
        {"position": "RCB", "line": "DEF", "x": 62, "y": 18},
        {"position": "RB",  "line": "DEF", "x": 84, "y": 26},
        {"position": "LM",  "line": "MID", "x": 18, "y": 52},
        {"position": "LCM", "line": "MID", "x": 40, "y": 48},
        {"position": "RCM", "line": "MID", "x": 60, "y": 48},
        {"position": "RM",  "line": "MID", "x": 82, "y": 52},
        {"position": "LST", "line": "FWD", "x": 40, "y": 86},
        {"position": "RST", "line": "FWD", "x": 60, "y": 86},
    ],
    "4-4-1-1": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LB",  "line": "DEF", "x": 16, "y": 26},
        {"position": "LCB", "line": "DEF", "x": 38, "y": 18},
        {"position": "RCB", "line": "DEF", "x": 62, "y": 18},
        {"position": "RB",  "line": "DEF", "x": 84, "y": 26},
        {"position": "LM",  "line": "MID", "x": 18, "y": 50},
        {"position": "LCM", "line": "MID", "x": 40, "y": 46},
        {"position": "RCM", "line": "MID", "x": 60, "y": 46},
        {"position": "RM",  "line": "MID", "x": 82, "y": 50},
        {"position": "SS",  "line": "FWD", "x": 50, "y": 72},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 90},
    ],
    "3-5-2": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LCB", "line": "DEF", "x": 30, "y": 18},
        {"position": "CB",  "line": "DEF", "x": 50, "y": 16},
        {"position": "RCB", "line": "DEF", "x": 70, "y": 18},
        {"position": "LWB", "line": "MID", "x": 12, "y": 50},
        {"position": "LCM", "line": "MID", "x": 36, "y": 46},
        {"position": "CM",  "line": "MID", "x": 50, "y": 42},
        {"position": "RCM", "line": "MID", "x": 64, "y": 46},
        {"position": "RWB", "line": "MID", "x": 88, "y": 50},
        {"position": "LST", "line": "FWD", "x": 40, "y": 86},
        {"position": "RST", "line": "FWD", "x": 60, "y": 86},
    ],
    "3-4-3": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LCB", "line": "DEF", "x": 30, "y": 18},
        {"position": "CB",  "line": "DEF", "x": 50, "y": 16},
        {"position": "RCB", "line": "DEF", "x": 70, "y": 18},
        {"position": "LWB", "line": "MID", "x": 12, "y": 50},
        {"position": "LCM", "line": "MID", "x": 40, "y": 46},
        {"position": "RCM", "line": "MID", "x": 60, "y": 46},
        {"position": "RWB", "line": "MID", "x": 88, "y": 50},
        {"position": "LW",  "line": "FWD", "x": 22, "y": 80},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 88},
        {"position": "RW",  "line": "FWD", "x": 78, "y": 80},
    ],
    "3-4-2-1": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LCB", "line": "DEF", "x": 30, "y": 18},
        {"position": "CB",  "line": "DEF", "x": 50, "y": 16},
        {"position": "RCB", "line": "DEF", "x": 70, "y": 18},
        {"position": "LWB", "line": "MID", "x": 12, "y": 48},
        {"position": "LCM", "line": "MID", "x": 40, "y": 44},
        {"position": "RCM", "line": "MID", "x": 60, "y": 44},
        {"position": "RWB", "line": "MID", "x": 88, "y": 48},
        {"position": "LAM", "line": "FWD", "x": 34, "y": 72},
        {"position": "RAM", "line": "FWD", "x": 66, "y": 72},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 90},
    ],
    "5-3-2": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LWB", "line": "DEF", "x": 12, "y": 32},
        {"position": "LCB", "line": "DEF", "x": 33, "y": 18},
        {"position": "CB",  "line": "DEF", "x": 50, "y": 16},
        {"position": "RCB", "line": "DEF", "x": 67, "y": 18},
        {"position": "RWB", "line": "DEF", "x": 88, "y": 32},
        {"position": "LCM", "line": "MID", "x": 34, "y": 50},
        {"position": "CM",  "line": "MID", "x": 50, "y": 46},
        {"position": "RCM", "line": "MID", "x": 66, "y": 50},
        {"position": "LST", "line": "FWD", "x": 40, "y": 84},
        {"position": "RST", "line": "FWD", "x": 60, "y": 84},
    ],
    "5-4-1": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LWB", "line": "DEF", "x": 12, "y": 32},
        {"position": "LCB", "line": "DEF", "x": 33, "y": 18},
        {"position": "CB",  "line": "DEF", "x": 50, "y": 16},
        {"position": "RCB", "line": "DEF", "x": 67, "y": 18},
        {"position": "RWB", "line": "DEF", "x": 88, "y": 32},
        {"position": "LM",  "line": "MID", "x": 20, "y": 52},
        {"position": "LCM", "line": "MID", "x": 42, "y": 48},
        {"position": "RCM", "line": "MID", "x": 58, "y": 48},
        {"position": "RM",  "line": "MID", "x": 80, "y": 52},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 88},
    ],
    "4-1-4-1": [
        {"position": "GK",  "line": "GK",  "x": 50, "y": 6},
        {"position": "LB",  "line": "DEF", "x": 16, "y": 26},
        {"position": "LCB", "line": "DEF", "x": 38, "y": 18},
        {"position": "RCB", "line": "DEF", "x": 62, "y": 18},
        {"position": "RB",  "line": "DEF", "x": 84, "y": 26},
        {"position": "DM",  "line": "MID", "x": 50, "y": 38},
        {"position": "LM",  "line": "MID", "x": 20, "y": 58},
        {"position": "LCM", "line": "MID", "x": 42, "y": 56},
        {"position": "RCM", "line": "MID", "x": 58, "y": 56},
        {"position": "RM",  "line": "MID", "x": 80, "y": 58},
        {"position": "ST",  "line": "FWD", "x": 50, "y": 88},
    ],
}

# Group signature (n_def, n_mid, n_fwd) -> canonical formation name. Used to snap
# an inferred line makeup to a real template. Several shapes share a signature
# (4-2-3-1 and 4-1-4-1 are both 4/5/1); we pick the most common modern default.
SIGNATURE_TO_FORMATION: dict[tuple[int, int, int], str] = {
    (4, 3, 3): "4-3-3",
    (4, 5, 1): "4-2-3-1",
    (4, 4, 2): "4-4-2",
    (3, 5, 2): "3-5-2",
    (3, 4, 3): "3-4-3",
    (3, 6, 1): "3-4-2-1",
    (5, 3, 2): "5-3-2",
    (5, 4, 1): "5-4-1",
    (5, 2, 3): "5-3-2",
    (4, 2, 4): "4-4-2",
}

LINE_OF_GROUP = {"GK": "GK", "DEF": "DEF", "MID": "MID", "FWD": "FWD"}


def primary_line(position: str) -> tuple[str, bool]:
    """Return (line, eligible). line in GK/DEF/MID/FWD.

    Understat lists a player's positions in a fixed order (D, F, M, GK, S), not
    by how often each was played, so the *first* token over-tags utility players
    as defenders (a midfielder who covered at full-back reads as 'D M'). We
    instead take the most attacking token present (F > M > D), which keeps
    genuine defenders as DEF (they only ever carry 'D') while restoring wingers
    and midfielders who occasionally dropped back. Pure 'S' players (sub only,
    no recorded line) are labelled MID and are not eligible for the best XI."""
    tokens = set(str(position).split())
    if tokens == {"S"} or not tokens:
        return "MID", False
    if "GK" in tokens and tokens <= {"GK", "S"}:
        return "GK", True
    if "F" in tokens:
        return "FWD", True
    if "M" in tokens:
        return "MID", True
    if "D" in tokens:
        return "DEF", True
    if "GK" in tokens:
        return "GK", True
    return "MID", False


def _round(v, n=1):
    try:
        return round(float(v), n)
    except (TypeError, ValueError):
        return 0.0


# DEF minute share (x10) at/above which we read a genuine back five. Calibrated
# on the season: the top ~6 clubs by defensive minute share are the ones that
# actually deployed three centre backs plus wing backs (Inter, Palace, Union,
# Lens, Lorient, Toulouse). Below it we default to a back four.
_BACK_FIVE_THRESHOLD = 4.3


def _infer_formation(outfield: pd.DataFrame) -> str:
    """Infer a club's representative shape from its outfield minute allocation.

    The source's coarse position tags cannot cleanly separate a full back from a
    wide midfielder, which biases the defensive minute share downward, so a *low*
    defensive share is not reliable evidence of a back three (back four sides read
    low too). A *high* defensive share, however, can only come from genuinely
    fielding extra defenders. We therefore anchor the back line at four, escalate
    to five only on a strong defensive signal, and never infer a back three. The
    forward count comes from the forward minute share (clamped 1..3); the midfield
    is whatever remains. This is documented as a deliberate approximation."""
    line_min = outfield.groupby("line")["minutes"].sum()
    total = float(line_min.sum())
    if total <= 0:
        return "4-3-3"
    def_share = 10.0 * line_min.get("DEF", 0) / total
    fwd_share = 10.0 * line_min.get("FWD", 0) / total

    n_def = 5 if def_share >= _BACK_FIVE_THRESHOLD else 4
    n_fwd = min(3, max(1, int(fwd_share + 0.5)))
    n_mid = 10 - n_def - n_fwd
    if n_mid < 2:  # too many forwards for this back line; trim forwards
        n_fwd -= (2 - n_mid)
        n_mid = 2
    sig = (n_def, n_mid, n_fwd)

    if sig in SIGNATURE_TO_FORMATION:
        return SIGNATURE_TO_FORMATION[sig]
    best_name, best_d = "4-3-3", 10**9
    for cand_sig, name in SIGNATURE_TO_FORMATION.items():
        d = sum((a - b) ** 2 for a, b in zip(sig, cand_sig))
        if d < best_d:
            best_name, best_d = name, d
    return best_name


def _build_best_xi(players: list[dict], formation: str) -> tuple[list[dict], str, bool]:
    """Fill the formation template's slots. Returns (bestXI, formation_used,
    was_fallback). Each slot gets the highest minutes eligible player in its
    line; if a line runs short, the next highest minutes unused player fills in."""
    fallback = formation not in FORMATION_TEMPLATES
    formation_used = formation if not fallback else "4-3-3"
    template = FORMATION_TEMPLATES[formation_used]

    eligible = [p for p in players if p["_eligible"]]
    by_line: dict[str, list[dict]] = defaultdict(list)
    for p in sorted(eligible, key=lambda p: p["minutes"], reverse=True):
        by_line[p["line"]].append(p)

    used: set[str] = set()
    # spare pool for short lines: any eligible outfield player, minutes desc
    spare = [p for p in sorted(eligible, key=lambda p: p["minutes"], reverse=True)
             if p["line"] != "GK"]

    best_xi: list[dict] = []
    for slot in template:
        line = slot["line"]
        pick = None
        for cand in by_line.get(line, []):
            if cand["id"] not in used:
                pick = cand
                break
        if pick is None:  # borrow from spare pool
            for cand in spare:
                if cand["id"] not in used:
                    pick = cand
                    break
        if pick is None:
            continue  # no one left; leave slot empty (extremely rare)
        used.add(pick["id"])
        best_xi.append({
            "playerId": pick["id"],
            "position": slot["position"],
            "x": slot["x"],
            "y": slot["y"],
        })
    return best_xi, formation_used, fallback


def _melt_team_matches(tm: pd.DataFrame) -> pd.DataFrame:
    """One row per team per match from the home/away wide format."""
    home = tm.rename(columns={
        "home_team": "team", "home_team_id": "team_id",
        "home_goals": "gf", "away_goals": "ga",
        "home_xg": "xg", "away_xg": "xga", "home_np_xg": "npxg",
        "home_points": "points", "home_expected_points": "xpoints",
        "home_ppda": "ppda", "home_deep_completions": "deep",
    })[["league", "team", "team_id", "gf", "ga", "xg", "xga", "npxg",
        "points", "xpoints", "ppda", "deep"]]
    away = tm.rename(columns={
        "away_team": "team", "away_team_id": "team_id",
        "away_goals": "gf", "home_goals": "ga",
        "away_xg": "xg", "home_xg": "xga", "away_np_xg": "npxg",
        "away_points": "points", "away_expected_points": "xpoints",
        "away_ppda": "ppda", "away_deep_completions": "deep",
    })[["league", "team", "team_id", "gf", "ga", "xg", "xga", "npxg",
        "points", "xpoints", "ppda", "deep"]]
    return pd.concat([home, away], ignore_index=True)


def _club_matches(tm: pd.DataFrame) -> dict[str, list[dict]]:
    """Per club chronological match rows for the form line chart and sparklines.
    Keyed by club slug. Each row is lean: matchday index, xG, xGA, points,
    opponent, result. About 34 to 38 rows per club."""
    rows: list[dict] = []
    for _, r in tm.iterrows():
        date = r["date"]
        rows.append({"team": r["home_team"], "opp": r["away_team"], "date": date,
                     "xg": r["home_xg"], "xga": r["away_xg"], "gf": r["home_goals"],
                     "ga": r["away_goals"], "pts": int(r["home_points"])})
        rows.append({"team": r["away_team"], "opp": r["home_team"], "date": date,
                     "xg": r["away_xg"], "xga": r["home_xg"], "gf": r["away_goals"],
                     "ga": r["home_goals"], "pts": int(r["away_points"])})
    df = pd.DataFrame(rows).sort_values(["team", "date"])
    out: dict[str, list[dict]] = {}
    for team, g in df.groupby("team"):
        matches = []
        for i, (_, m) in enumerate(g.iterrows(), start=1):
            result = "W" if m["pts"] == 3 else ("D" if m["pts"] == 1 else "L")
            matches.append({
                "md": i,
                "xG": _round(m["xg"], 2),
                "xGA": _round(m["xga"], 2),
                "gf": int(m["gf"]),
                "ga": int(m["ga"]),
                "pts": int(m["pts"]),
                "opp": m["opp"],
                "res": result,
            })
        out[slugify(team)] = matches
    return out


def build_dataset() -> dict:
    players_raw = pd.read_pickle(RAW_DIR / "players.pkl")
    tm = pd.read_pickle(RAW_DIR / "team_matches.pkl")
    season_label = LEAGUE_SEASON_LABEL

    # --- team aggregates ---
    per_tm = _melt_team_matches(tm)
    agg = per_tm.groupby(["league", "team"], as_index=False).agg(
        matchesPlayed=("gf", "size"),
        points=("points", "sum"),
        goalsFor=("gf", "sum"),
        goalsAgainst=("ga", "sum"),
        xG=("xg", "sum"),
        xGA=("xga", "sum"),
        npxG=("npxg", "sum"),
        xPoints=("xpoints", "sum"),
        ppda=("ppda", "mean"),
    )
    agg["goalDifference"] = agg["goalsFor"] - agg["goalsAgainst"]
    agg["xGDiff"] = agg["xG"] - agg["xGA"]
    # league position: points desc, then goal difference, then goals for
    agg["position"] = (
        agg.sort_values(["points", "goalDifference", "goalsFor"], ascending=False)
        .groupby("league").cumcount() + 1
    )
    team_id_lookup = per_tm.groupby(["league", "team"])["team_id"].first().to_dict()
    matches_by_club = _club_matches(tm)

    # --- leagues.json ---
    leagues_out = []
    for lg in players_raw["league"].unique():
        meta = LEAGUE_META[lg]
        leagues_out.append({**meta, "season": season_label})
    leagues_out.sort(key=lambda x: x["name"])

    # --- per club players + best XI ---
    clubs_light: list[dict] = []
    clubs_detail: dict[str, dict] = {}

    for lg, lg_players in players_raw.groupby("league"):
        meta = LEAGUE_META[lg]
        for team, roster in lg_players.groupby("team"):
            club_id = slugify(team)
            players: list[dict] = []
            seen_ids: dict[str, int] = {}
            for _, r in roster.iterrows():
                line, eligible = primary_line(r["position"])
                minutes = int(r["minutes"])
                shots_per90 = (r["shots"] / (minutes / 90.0)) if minutes > 0 else 0.0
                pid = player_slug(r["player"])
                # de-dup ids within a club (rare name collisions)
                if pid in seen_ids:
                    seen_ids[pid] += 1
                    pid = f"{pid}-{seen_ids[pid]}"
                else:
                    seen_ids[pid] = 1
                players.append({
                    "id": pid,
                    "name": r["player"],
                    "position": line,
                    "positionGroup": line,
                    "minutes": minutes,
                    "matches": int(r["matches"]),
                    "goals": int(r["goals"]),
                    "assists": int(r["assists"]),
                    "xG": _round(r["xg"]),
                    "xA": _round(r["xa"]),
                    "npxG": _round(r["np_xg"]),
                    "shots": int(r["shots"]),
                    "keyPasses": int(r["key_passes"]),
                    "shotsPer90": _round(shots_per90),
                    "_eligible": bool(eligible) and minutes > 0,
                    "line": line,
                })

            outfield = pd.DataFrame([p for p in players if p["line"] != "GK"])
            formation = _infer_formation(outfield) if not outfield.empty else "4-3-3"
            best_xi, formation_used, was_fallback = _build_best_xi(players, formation)

            # strip internal keys from exported players
            export_players = [{k: v for k, v in p.items()
                               if k not in ("_eligible", "line")} for p in players]
            export_players.sort(key=lambda p: p["minutes"], reverse=True)

            club_matches = matches_by_club.get(club_id, [])
            row_light = {
                "id": club_id,
                "name": team,
                "leagueId": meta["id"],
                "teamId": None,  # API-Football id, populated by transfers seed if present
                "understatTeamId": int(team_id_lookup.get((lg, team), 0)),
                "crestColor": club_color(team, meta["id"]),
                "stats": _club_stats(agg, lg, team),
                # rolling-5 xG margin per matchday: a tiny form sparkline for the
                # landing-page league table (kept in the light file on purpose).
                "spark": _spark_series(club_matches),
            }
            clubs_light.append(row_light)

            clubs_detail[club_id] = {
                "id": club_id,
                "name": team,
                "leagueId": meta["id"],
                "crestColor": row_light["crestColor"],
                "formation": formation_used,
                "formationIsFallback": was_fallback,
                "players": export_players,
                "bestXI": best_xi,
                "matches": matches_by_club.get(club_id, []),
                "transfers": [],  # baked in later by transfers stage (P3)
            }

    clubs_light.sort(key=lambda c: (c["leagueId"], c["stats"]["position"]))
    return {"leagues": leagues_out, "clubs_light": clubs_light, "clubs_detail": clubs_detail}


def _spark_series(matches: list[dict]) -> list[float]:
    """Rolling-5 xG margin (xG minus xGA) per matchday, rounded to 1 decimal.
    Small enough (~38 numbers) to live in the light clubs.json for table rows."""
    margins = [m["xG"] - m["xGA"] for m in matches]
    out = []
    for i in range(len(margins)):
        window = margins[max(0, i - 4):i + 1]
        out.append(round(sum(window) / len(window), 1) or 0.0)  # avoid -0.0
    return out


def _club_stats(agg: pd.DataFrame, league: str, team: str) -> dict:
    row = agg[(agg["league"] == league) & (agg["team"] == team)].iloc[0]
    return {
        "position": int(row["position"]),
        "points": int(row["points"]),
        "matchesPlayed": int(row["matchesPlayed"]),
        "goalsFor": int(row["goalsFor"]),
        "goalsAgainst": int(row["goalsAgainst"]),
        "goalDifference": int(row["goalDifference"]),
        "xG": _round(row["xG"]),
        "xGA": _round(row["xGA"]),
        "xGDiff": _round(row["xGDiff"]),
        "xPoints": _round(row["xPoints"]),
        "ppda": _round(row["ppda"], 2),
    }


# --- club accent colours -------------------------------------------------
# Curated primary colours for well known clubs; deterministic league-tinted
# fallback for the rest so every mark has a stable, distinct-ish colour.
CLUB_COLORS = {
    "Arsenal": "#EF0107", "Liverpool": "#C8102E", "Manchester City": "#6CABDD",
    "Manchester United": "#DA291C", "Chelsea": "#034694", "Tottenham": "#132257",
    "Newcastle United": "#241F20", "Aston Villa": "#95BFE5", "Brighton": "#0057B8",
    "West Ham": "#7A263A", "Everton": "#003399", "Nottingham Forest": "#DD0000",
    "Real Madrid": "#FEBE10", "Barcelona": "#A50044", "Atletico Madrid": "#CB3524",
    "Athletic Club": "#EE2523", "Real Sociedad": "#0067B1", "Villarreal": "#FFE667",
    "Sevilla": "#D8010F", "Real Betis": "#00954C", "Valencia": "#F18E00",
    "Bayern Munich": "#DC052D", "Borussia Dortmund": "#FDE100", "RB Leipzig": "#DD0741",
    "Bayer Leverkusen": "#E32219", "Eintracht Frankfurt": "#E1000F", "VfB Stuttgart": "#E32219",
    "Inter": "#0068A8", "AC Milan": "#FB090B", "Juventus": "#000000", "Napoli": "#12A0D7",
    "AS Roma": "#8E1F2F", "Lazio": "#87D8F7", "Atalanta": "#1E71B8", "Fiorentina": "#592C82",
    "Paris Saint Germain": "#004170", "Marseille": "#2FAEE0", "Monaco": "#E51B22",
    "Lyon": "#DA001A", "Lille": "#E01E13", "Nice": "#C7101B",
}

_LEAGUE_FALLBACK = {
    "eng-premier-league": (0.9, 0.35, 0.4),
    "esp-la-liga": (0.95, 0.6, 0.25),
    "ita-serie-a": (0.35, 0.6, 0.9),
    "ger-bundesliga": (0.9, 0.5, 0.3),
    "fra-ligue-1": (0.4, 0.75, 0.7),
}


def club_color(name: str, league_id: str) -> str:
    if name in CLUB_COLORS:
        return CLUB_COLORS[name]
    # deterministic pleasant fallback derived from the name hash, league tinted
    h = sum(ord(c) for c in name)
    base = _LEAGUE_FALLBACK.get(league_id, (0.6, 0.6, 0.6))
    jitter = ((h % 60) - 30) / 255.0
    rgb = tuple(min(255, max(40, int((c + jitter) * 255))) for c in base)
    return "#%02X%02X%02X" % rgb


# season label derived once from the raw pull's season id (e.g. 2526 -> 2025-2026)
def _season_label() -> str:
    tm = pd.read_pickle(RAW_DIR / "team_matches.pkl")
    sid = str(tm["season"].iloc[0])  # '2526'
    if len(sid) == 4:
        return f"20{sid[:2]}-20{sid[2:]}"
    return sid


LEAGUE_SEASON_LABEL = _season_label()


def _validation_gate(data: dict) -> None:
    """Eyeball check: print formation + best XI for a few well known clubs."""
    detail = data["clubs_detail"]
    print(f"\nSeason: {LEAGUE_SEASON_LABEL}")
    print(f"Clubs built: {len(detail)}\n")
    fallbacks = [c["name"] for c in detail.values() if c["formationIsFallback"]]
    if fallbacks:
        print(f"Formation fell back to 4-3-3 for {len(fallbacks)}: {fallbacks}\n")

    watch = ["arsenal", "liverpool", "real-madrid", "bayern-munich", "inter",
             "paris-saint-germain"]
    for cid in watch:
        club = detail.get(cid)
        if not club:
            continue
        pmap = {p["id"]: p for p in club["players"]}
        print(f"=== {club['name']}  ({club['formation']}) ===")
        for slot in club["bestXI"]:
            p = pmap.get(slot["playerId"], {})
            print(f"  {slot['position']:4s} {p.get('name','?'):24s} "
                  f"{p.get('positionGroup',''):4s} min={p.get('minutes',0):5d} "
                  f"G={p.get('goals',0):2d} A={p.get('assists',0):2d}")
        print()

    # structural checks
    problems = []
    for cid, club in detail.items():
        if len(club["bestXI"]) != 11:
            problems.append(f"{cid}: bestXI has {len(club['bestXI'])} slots")
        ids = {p["id"] for p in club["players"]}
        for slot in club["bestXI"]:
            if slot["playerId"] not in ids:
                problems.append(f"{cid}: slot {slot['position']} -> missing player")
        gk_slot = next((s for s in club["bestXI"] if s["position"] == "GK"), None)
        if gk_slot:
            gk = next(p for p in club["players"] if p["id"] == gk_slot["playerId"])
            if gk["positionGroup"] != "GK":
                problems.append(f"{cid}: GK slot filled by {gk['positionGroup']}")
    if problems:
        print("VALIDATION PROBLEMS:")
        for p in problems[:40]:
            print("  " + p)
        sys.exit(1)
    print("PASS: every club has a full 11 slot best XI, GK slots are goalkeepers, "
          "all playerIds resolve.")


if __name__ == "__main__":
    _validation_gate(build_dataset())
