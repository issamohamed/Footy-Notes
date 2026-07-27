import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Player } from "../lib/types";
import "./PlayerStatsChart.css";

interface Props {
  players: Player[];
}

type MetricKey =
  | "ga" | "goals" | "assists" | "xG" | "xA" | "npxG" | "shots" | "keyPasses" | "minutes";

const PLAYER_METRICS: { key: MetricKey; label: string; get: (p: Player) => number; d?: number }[] = [
  { key: "ga", label: "Goals + Assists", get: (p) => p.goals + p.assists },
  { key: "goals", label: "Goals", get: (p) => p.goals },
  { key: "assists", label: "Assists", get: (p) => p.assists },
  { key: "xG", label: "Expected goals (xG)", get: (p) => p.xG, d: 1 },
  { key: "xA", label: "Expected assists (xA)", get: (p) => p.xA, d: 1 },
  { key: "npxG", label: "Non-penalty xG", get: (p) => p.npxG, d: 1 },
  { key: "shots", label: "Shots", get: (p) => p.shots },
  { key: "keyPasses", label: "Key passes", get: (p) => p.keyPasses },
  { key: "minutes", label: "Minutes", get: (p) => p.minutes },
];

const GROUPS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
const TOP_N = 14;

// scatter pairs: actual output vs expected, with a y=x reference line
const PAIRS = {
  goals: { label: "Goals vs xG", x: (p: Player) => p.xG, y: (p: Player) => p.goals, xl: "xG", yl: "Goals" },
  assists: { label: "Assists vs xA", x: (p: Player) => p.xA, y: (p: Player) => p.assists, xl: "xA", yl: "Assists" },
};
type PairKey = keyof typeof PAIRS;

export default function PlayerStatsChart({ players }: Props) {
  const [view, setView] = useState<"bars" | "scatter">("bars");
  return (
    <div className="psc panel">
      <div className="psc__head">
        <div>
          <div className="eyebrow">Squad · player stats</div>
          <h2 className="display psc__title">
            {view === "bars" ? "Ranked leaders" : "Output vs expected"}
          </h2>
        </div>
        <div className="psc__viewtoggle" role="tablist" aria-label="Chart view">
          <button role="tab" aria-selected={view === "bars"}
                  className={view === "bars" ? "is-active" : ""}
                  onClick={() => setView("bars")}>Bars</button>
          <button role="tab" aria-selected={view === "scatter"}
                  className={view === "scatter" ? "is-active" : ""}
                  onClick={() => setView("scatter")}>Scatter</button>
        </div>
      </div>
      {view === "bars" ? <Bars players={players} /> : <Scatter players={players} />}
    </div>
  );
}

function Bars({ players }: { players: Player[] }) {
  const [metricKey, setMetricKey] = useState<MetricKey>("ga");
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("ALL");
  const [hover, setHover] = useState<string | null>(null);
  const m = PLAYER_METRICS.find((x) => x.key === metricKey)!;

  const rows = useMemo(() => {
    const pool = group === "ALL" ? players : players.filter((p) => p.positionGroup === group);
    return [...pool]
      .map((p) => ({ p, v: m.get(p) }))
      .filter((r) => r.v > 0 || metricKey === "minutes")
      .sort((a, b) => b.v - a.v)
      .slice(0, TOP_N);
  }, [players, group, m, metricKey]);

  const max = d3.max(rows, (r) => r.v) ?? 1;
  const x = d3.scaleLinear().domain([0, max]).range([0, 100]);
  const fmt = (v: number) => (m.d ? v.toFixed(m.d) : String(v));

  return (
    <>
      <div className="psc__controls">
        <div className="psc__groups" role="tablist" aria-label="Position filter">
          {GROUPS.map((g) => (
            <button key={g} role="tab" aria-selected={group === g}
                    className={`psc__group ${group === g ? "is-active" : ""}`}
                    onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
        <select className="psc__metric" value={metricKey}
                onChange={(e) => setMetricKey(e.target.value as MetricKey)} aria-label="Metric">
          {PLAYER_METRICS.map((pm) => <option key={pm.key} value={pm.key}>{pm.label}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="psc__empty">No players match this filter.</p>
      ) : (
        <div className="psc__bars">
          {rows.map((r) => {
            const active = hover === r.p.id;
            return (
              <div key={r.p.id} className={`psc__row ${active ? "is-active" : ""}`}
                   onMouseEnter={() => setHover(r.p.id)} onMouseLeave={() => setHover(null)}
                   tabIndex={0} onFocus={() => setHover(r.p.id)} onBlur={() => setHover(null)}>
                <div className="psc__name" title={r.p.name}>{r.p.name}</div>
                <div className="psc__track">
                  <div className="psc__fill" style={{ width: `${x(r.v)}%` }} />
                </div>
                <div className="psc__val mono">{fmt(r.v)}</div>
              </div>
            );
          })}
        </div>
      )}
      <p className="psc__hint">Top {TOP_N} by the selected metric. Hover a row to highlight.</p>
    </>
  );
}

function Scatter({ players }: { players: Player[] }) {
  const [pairKey, setPairKey] = useState<PairKey>("goals");
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(460);
  const height = 340;
  const M = { top: 16, right: 18, bottom: 40, left: 44 };
  const pair = PAIRS[pairKey];

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(
    () => players.filter((p) => p.positionGroup !== "GK" && (pair.x(p) > 0.4 || pair.y(p) > 0)),
    [players, pair]
  );

  const maxV = Math.max(1, d3.max(pts, (p) => Math.max(pair.x(p), pair.y(p))) ?? 1);
  const dom: [number, number] = [0, maxV * 1.08];
  const x = d3.scaleLinear().domain(dom).range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain(dom).range([height - M.bottom, M.top]);
  const hovered = hover ? pts.find((p) => p.id === hover) ?? null : null;

  return (
    <>
      <div className="psc__controls">
        <div className="psc__groups" role="tablist" aria-label="Scatter metric">
          {(Object.keys(PAIRS) as PairKey[]).map((k) => (
            <button key={k} role="tab" aria-selected={pairKey === k}
                    className={`psc__group ${pairKey === k ? "is-active" : ""}`}
                    onClick={() => setPairKey(k)}>{PAIRS[k].label}</button>
          ))}
        </div>
      </div>

      <div className="psc__scatterwrap" ref={wrapRef}>
        <svg width={width} height={height} className={`psc__scatter ${hover ? "is-hovering" : ""}`}
             role="img" aria-label={`${pair.yl} against ${pair.xl} for each player`}>
          {/* y = x reference line: above it, outperforming expected */}
          <line className="psc__diag" x1={x(dom[0])} y1={y(dom[0])} x2={x(dom[1])} y2={y(dom[1])} />
          <text className="psc__diaglabel" x={x(dom[1]) - 4} y={y(dom[1]) + 14} textAnchor="end">
            above the line: outperforming {pair.xl}
          </text>

          <g className="psc__axis">
            {x.ticks(5).map((t) => (
              <text key={`x${t}`} x={x(t)} y={height - M.bottom + 16} textAnchor="middle">{t}</text>
            ))}
            {y.ticks(5).map((t) => (
              <text key={`y${t}`} x={M.left - 8} y={y(t) + 3} textAnchor="end">{t}</text>
            ))}
            <text className="psc__axistitle" x={(M.left + width - M.right) / 2} y={height - 6} textAnchor="middle">{pair.xl}</text>
            <text className="psc__axistitle" transform={`translate(12 ${(M.top + height - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">{pair.yl}</text>
          </g>

          <g className="psc__pts">
            {pts.map((p) => {
              const isH = hover === p.id;
              const over = pair.y(p) - pair.x(p);
              const cls = ["psc__pt", isH ? "is-hover" : "", over > 1 ? "is-over" : over < -1 ? "is-under" : ""].join(" ");
              return (
                <g key={p.id} className={cls} transform={`translate(${x(pair.x(p))} ${y(pair.y(p))})`}
                   tabIndex={0} role="button"
                   aria-label={`${p.name}, ${pair.yl} ${pair.y(p)}, ${pair.xl} ${pair.x(p)}`}
                   onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
                   onFocus={() => setHover(p.id)} onBlur={() => setHover(null)}>
                  <circle className="psc__pthit" r={11} />
                  <circle className="psc__ptdot" />
                </g>
              );
            })}
          </g>
        </svg>
        {hovered && (
          <div className="psc__pttip glass" style={ptTipStyle(x(pair.x(hovered)), y(pair.y(hovered)), width)}>
            <div className="psc__pttip-name display">{hovered.name}</div>
            <div className="psc__pttip-row mono">{pair.yl} {pair.y(hovered)} · {pair.xl} {pair.x(hovered).toFixed(1)}</div>
            <div className={`psc__pttip-delta ${pair.y(hovered) >= pair.x(hovered) ? "is-over" : "is-under"}`}>
              {pair.y(hovered) >= pair.x(hovered) ? "outperforming" : "underperforming"} by {Math.abs(pair.y(hovered) - pair.x(hovered)).toFixed(1)}
            </div>
          </div>
        )}
      </div>
      <p className="psc__hint">Each dot is a player. The diagonal is {pair.yl.toLowerCase()} = {pair.xl}; dots above it are outperforming their expected numbers.</p>
    </>
  );
}

function ptTipStyle(sx: number, sy: number, width: number): React.CSSProperties {
  const onRight = sx > width / 2;
  return { left: onRight ? undefined : sx + 14, right: onRight ? width - sx + 14 : undefined, top: Math.max(4, sy - 10) };
}
