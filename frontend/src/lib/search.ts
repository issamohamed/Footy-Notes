import type { ClubLight } from "./types";

// Diacritic- and case-insensitive normalization: "Atlético" -> "atletico",
// "Mönchengladbach" -> "monchengladbach".
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .trim();
}

// Common shorthands where the informal name differs from the dataset name.
// Keyed by exact dataset club name.
const ALIASES: Record<string, string[]> = {
  "Paris Saint Germain": ["psg", "paris sg", "paris saint-germain"],
  "Manchester United": ["man utd", "man united", "united", "mufc", "man u"],
  "Manchester City": ["man city", "mcfc", "city"],
  "Tottenham": ["spurs", "tottenham hotspur", "thfc"],
  "Wolverhampton Wanderers": ["wolves", "wwfc"],
  "Borussia M.Gladbach": ["gladbach", "monchengladbach", "borussia monchengladbach", "bmg", "m gladbach"],
  "Atletico Madrid": ["atleti", "atletico", "atm"],
  "Inter": ["inter milan", "internazionale"],
  "Bayern Munich": ["bayern", "fcb munich", "fc bayern"],
  "Real Madrid": ["real", "madrid", "rmcf", "los blancos"],
  "Barcelona": ["barca", "fcb", "barcelona fc"],
  "Athletic Club": ["athletic bilbao", "bilbao", "athletic"],
  "Borussia Dortmund": ["dortmund", "bvb"],
  "AC Milan": ["milan", "acm", "rossoneri"],
  "AS Roma": ["roma"],
  "Newcastle United": ["newcastle", "nufc", "toon"],
};

function initials(name: string): string {
  return normalize(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

export interface Indexed {
  club: ClubLight;
  norm: string;
  words: string[];
  aliases: string[];
  inits: string;
}

export function buildIndex(clubs: ClubLight[]): Indexed[] {
  return clubs.map((club) => {
    const norm = normalize(club.name);
    return {
      club,
      norm,
      words: norm.split(/[^a-z0-9]+/).filter(Boolean),
      aliases: (ALIASES[club.name] ?? []).map(normalize),
      inits: initials(club.name),
    };
  });
}

// Higher is better. 0 means no match.
function scoreOne(idx: Indexed, q: string): number {
  let best = 0;
  const consider = (n: number) => { if (n > best) best = n; };

  if (idx.norm === q) consider(100);
  else if (idx.norm.startsWith(q)) consider(80);
  if (idx.words.some((w) => w === q)) consider(85);
  else if (idx.words.some((w) => w.startsWith(q))) consider(60);
  if (idx.norm.includes(q)) consider(40);

  // initials, e.g. "psg" via aliases already, "rm" -> Real Madrid, "acm"
  if (idx.inits === q) consider(90);
  else if (idx.inits.startsWith(q) && q.length >= 2) consider(50);

  // aliases (informal shorthands)
  for (const a of idx.aliases) {
    if (a === q) consider(95);
    else if (a.startsWith(q)) consider(70);
    else if (a.includes(q)) consider(45);
  }
  return best;
}

export function search(index: Indexed[], rawQuery: string, limit = 8): ClubLight[] {
  const q = normalize(rawQuery);
  if (!q) {
    // default: top clubs by points across all leagues
    return [...index]
      .map((i) => i.club)
      .sort((a, b) => b.stats.points - a.stats.points)
      .slice(0, limit);
  }
  return index
    .map((idx) => ({ club: idx.club, score: scoreOne(idx, q) }))
    .filter((r) => r.score > 0)
    // rank by score, then by points (prominent club wins ties)
    .sort((a, b) => b.score - a.score || b.club.stats.points - a.club.stats.points)
    .slice(0, limit)
    .map((r) => r.club);
}
