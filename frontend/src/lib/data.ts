// Fetch + in-memory cache helpers. All paths are built from BASE_URL so they
// resolve correctly whether the app is served from the root or a subpath.
import type { ClubDetail, ClubLight, League } from "./types";

const BASE = import.meta.env.BASE_URL; // "/" on Cloudflare Pages

function dataUrl(path: string): string {
  // BASE always ends in "/"; strip a leading slash off path to avoid "//".
  return `${BASE}data/${path.replace(/^\//, "")}`;
}

const cache = new Map<string, unknown>();

async function getJson<T>(path: string): Promise<T> {
  const url = dataUrl(path);
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as T;
  cache.set(url, json);
  return json;
}

export function getLeagues(): Promise<League[]> {
  return getJson<League[]>("leagues.json");
}

export function getClubs(): Promise<ClubLight[]> {
  return getJson<ClubLight[]>("clubs.json");
}

export function getClubDetail(clubId: string): Promise<ClubDetail> {
  return getJson<ClubDetail>(`clubs/${clubId}.json`);
}
