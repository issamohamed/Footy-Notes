// Optional freshness layer. Cloudflare Pages Functions are file-routed, so this
// serves GET /api/transfers/:clubId. It sits ON TOP OF the static transfers
// baked into the club JSON; the frontend renders those instantly and only
// consults this endpoint as a silent refresh. The API key is a Cloudflare
// secret and never reaches the browser.
//
// This file is only exercised if you deploy the KV binding + secret and set
// VITE_ENABLE_TRANSFER_REFRESH=true at build time. The app works fully without
// it (see section 7 of the build manual and the README).

interface Env {
  TRANSFERS_KV?: KVNamespace;
  API_FOOTBALL_KEY?: string;
  // clubId -> API-Football teamId map, provided as a JSON string env var, so the
  // Function can resolve ids without bundling the seed file.
  CLUB_TEAM_IDS?: string;
}

interface EventContext<E> {
  request: Request;
  env: E;
  params: Record<string, string>;
}

const API_BASE = "https://v3.football.api-sports.io";
const KV_TTL_SECONDS = 72 * 60 * 60; // 72h: transfers are not time sensitive
const QUOTA_CEILING = 90; // stop live calls once the day's budget is near spent
const KEEP_N = 8;

interface Transfer {
  player: string | null;
  direction: "in" | "out";
  otherClub: string | null;
  date: string | null;
  fee: string | null;
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", ...extra },
  });
}

export async function onRequestGet(ctx: EventContext<Env>): Promise<Response> {
  const clubId = ctx.params.clubId;
  const { TRANSFERS_KV, API_FOOTBALL_KEY, CLUB_TEAM_IDS } = ctx.env;

  const ids: Record<string, number> = CLUB_TEAM_IDS ? safeParse(CLUB_TEAM_IDS) : {};
  const teamId = ids[clubId];
  if (!teamId) {
    return json({ error: "unknown club", clubId, transfers: [] }, 404);
  }

  // 1) KV first: within TTL, return immediately at zero quota cost.
  if (TRANSFERS_KV) {
    const cached = await TRANSFERS_KV.get(`transfers:${clubId}`, "json");
    if (cached) return json({ transfers: cached, source: "kv" });
  }

  // If we cannot make a live call, degrade to an empty soft response; the client
  // still has the static data baked into the club JSON.
  if (!API_FOOTBALL_KEY) {
    return json({ transfers: [], source: "none", note: "no live key configured" });
  }

  // 2) Daily budget guard (cheap spike insurance).
  const day = new Date().toISOString().slice(0, 10);
  if (TRANSFERS_KV) {
    const used = Number((await TRANSFERS_KV.get(`apiquota:${day}`)) ?? "0");
    if (used >= QUOTA_CEILING) {
      return json({ transfers: [], source: "quota-capped" });
    }
  }

  // 3) Cache miss: one upstream call, normalise server-side.
  try {
    const res = await fetch(`${API_BASE}/transfers?team=${teamId}`, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const raw = await res.json();
    const transfers = normalise(raw, clubId, ids);

    if (TRANSFERS_KV) {
      await TRANSFERS_KV.put(`transfers:${clubId}`, JSON.stringify(transfers), {
        expirationTtl: KV_TTL_SECONDS,
      });
      const used = Number((await TRANSFERS_KV.get(`apiquota:${day}`)) ?? "0");
      await TRANSFERS_KV.put(`apiquota:${day}`, String(used + 1), { expirationTtl: 172800 });
    }
    return json({ transfers, source: "live" });
  } catch (_err) {
    // 4) stale-while-error: serve stale KV if present, else soft empty.
    if (TRANSFERS_KV) {
      const stale = await TRANSFERS_KV.get(`transfers:${clubId}`, "json");
      if (stale) return json({ transfers: stale, source: "kv-stale" });
    }
    return json({ transfers: [], source: "error" });
  }
}

function safeParse(s: string): Record<string, number> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// Resolve the club's own name from the id map is not available here, so we tag
// direction by comparing the incoming team id to each transfer's team ids.
function normalise(raw: any, clubId: string, ids: Record<string, number>): Transfer[] {
  const teamId = ids[clubId];
  const rows: Transfer[] = [];
  for (const block of raw?.response ?? []) {
    const player = block?.player?.name ?? null;
    for (const tr of block?.transfers ?? []) {
      const inId = tr?.teams?.in?.id;
      const inName = tr?.teams?.in?.name ?? null;
      const outName = tr?.teams?.out?.name ?? null;
      const direction: "in" | "out" = inId === teamId ? "in" : "out";
      rows.push({
        player,
        direction,
        otherClub: direction === "in" ? outName : inName,
        date: tr?.date ?? null,
        fee: tr?.type && tr.type !== "N/A" ? tr.type : null,
      });
    }
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return rows.slice(0, KEEP_N);
}

// Minimal ambient types so this compiles without the full Workers types package.
interface KVNamespace {
  get(key: string, type?: "text" | "json"): Promise<any>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
