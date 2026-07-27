// Shared types. These mirror the JSON emitted by pipeline/export.py exactly.
// If you change a field here, change it in the pipeline too (this is the contract).

export interface League {
  id: string;
  name: string;
  country: string;
  season: string;
}

// Headline club aggregates shown on the overview. No possession: the Understat
// source does not carry it; we use a richer xG based set instead.
export interface ClubStats {
  position: number;
  points: number;
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  xG: number;
  xGA: number;
  xGDiff: number;
  xPoints: number;
  ppda: number;
}

// One row of the light clubs.json.
export interface ClubLight {
  id: string;
  name: string;
  leagueId: string;
  teamId: number | null; // API-Football id (for the optional transfers layer)
  understatTeamId: number;
  crestColor: string;
  stats: ClubStats;
  spark: number[]; // rolling-5 xG margin per matchday, for table row sparklines
}

export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: string;
  name: string;
  position: string; // line label (GK/DEF/MID/FWD from the source)
  positionGroup: PositionGroup;
  minutes: number;
  matches: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  npxG: number;
  shots: number;
  keyPasses: number;
  shotsPer90: number;
}

// A best-XI slot: which player fills it and where on the 0..100 pitch.
export interface FormationSlot {
  playerId: string;
  position: string; // slot label from the formation template, e.g. "RCB", "LW"
  x: number; // 0..100 left -> right
  y: number; // 0..100 own goal -> opponent goal
}

// One played match, chronological, for the form line chart and sparklines.
export interface MatchPoint {
  md: number; // matchday index 1..N
  xG: number;
  xGA: number;
  gf: number;
  ga: number;
  pts: number;
  opp: string;
  res: "W" | "D" | "L";
}

export type TransferDirection = "in" | "out";

export interface Transfer {
  player: string;
  direction: TransferDirection;
  otherClub: string;
  date: string | null;
  fee: string | null;
}

// The heavy clubs/{id}.json.
export interface ClubDetail {
  id: string;
  name: string;
  leagueId: string;
  crestColor: string;
  formation: string;
  formationIsFallback: boolean;
  teamId: number | null;
  players: Player[];
  bestXI: FormationSlot[];
  matches: MatchPoint[];
  transfers: Transfer[];
}

// A metric that can be plotted on an axis of the comparison scatter.
export interface MetricDef {
  key: keyof ClubStats;
  label: string; // legacy precise label (kept for aria / fallbacks)
  plain: string; // reader-facing plain-language name (leads everywhere)
  gloss?: string; // quiet analytics gloss shown beneath the plain name
  // whether "more is better" (drives quadrant tone / axis direction hints)
  higherIsBetter: boolean;
  format?: (v: number) => string;
}
