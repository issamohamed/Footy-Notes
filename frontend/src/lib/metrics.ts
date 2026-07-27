import type { MetricDef } from "./types";

const d1 = (v: number) => v.toFixed(1);
const int = (v: number) => String(Math.round(v));

// Axis-selectable metrics for the comparison scatter. Every metric leads with a
// plain-language name; the precise analytics term is a quiet gloss. Defaults are
// a scoring metric (attack) vs a goals-conceded metric (defence).
export const METRICS: MetricDef[] = [
  { key: "xG", label: "Expected goals (xG)", plain: "Scoring threat", gloss: "expected goals, xG", higherIsBetter: true, format: d1 },
  { key: "xGA", label: "Expected goals against (xGA)", plain: "Defensive solidity", gloss: "expected goals against, xGA", higherIsBetter: false, format: d1 },
  { key: "xGDiff", label: "xG difference", plain: "Chance margin", gloss: "xG difference", higherIsBetter: true, format: d1 },
  { key: "xPoints", label: "Expected points", plain: "Deserved points", gloss: "expected points, xPts", higherIsBetter: true, format: d1 },
  { key: "points", label: "Points", plain: "Points", higherIsBetter: true, format: int },
  { key: "goalsFor", label: "Goals for", plain: "Goals scored", gloss: "goals for", higherIsBetter: true, format: int },
  { key: "goalsAgainst", label: "Goals against", plain: "Goals conceded", gloss: "goals against", higherIsBetter: false, format: int },
  { key: "goalDifference", label: "Goal difference", plain: "Goal difference", higherIsBetter: true, format: int },
  { key: "ppda", label: "PPDA (pressing)", plain: "Pressing intensity", gloss: "PPDA", higherIsBetter: false, format: d1 },
];

export function metric(key: MetricDef["key"]): MetricDef {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export const LEAGUE_NAMES: Record<string, string> = {
  "eng-premier-league": "Premier League",
  "esp-la-liga": "La Liga",
  "ita-serie-a": "Serie A",
  "ger-bundesliga": "Bundesliga",
  "fra-ligue-1": "Ligue 1",
};

export const POSITION_GROUP_COLORS: Record<string, string> = {
  GK: "#f4c95d",
  DEF: "#4cc9f0",
  MID: "#8ce99a",
  FWD: "#ff7a90",
};
