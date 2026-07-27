import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useNavigate } from "react-router-dom";
import type { ClubLight, MetricDef } from "../lib/types";
import { metric as getMetric } from "../lib/metrics";
import MetricPicker from "./MetricPicker";
import "./ClubComparisonChart.css";

interface Props {
  clubs: ClubLight[]; // ALL clubs; filtering is done here via ghosting
  selectedLeague: string; // league id or "all"
  highlightId?: string | null; // controlled highlight (cross-highlight with table)
  onHover?: (id: string | null) => void;
}

const MARGIN = { top: 26, right: 30, bottom: 54, left: 62 };
const MAX_PLOT_W = 760; // constrain aspect so the plot never letterboxes on wide panels

export default function ClubComparisonChart({ clubs, selectedLeague, highlightId, onHover }: Props) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(760);
  const width = Math.min(containerW, MAX_PLOT_W);
  const height = Math.round(width * 0.66); // ~3:2 plot area

  const [xKey, setXKey] = useState<MetricDef["key"]>("xGA");
  const [yKey, setYKey] = useState<MetricDef["key"]>("xG");
  const [internalHover, setInternalHover] = useState<string | null>(null);
  const hoverId = highlightId !== undefined ? highlightId : internalHover;
  const setHoverId = (id: string | null) => (onHover ? onHover(id) : setInternalHover(id));

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((e) => setContainerW(e[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const xMetric = getMetric(xKey);
  const yMetric = getMetric(yKey);

  const isActive = (c: ClubLight) => selectedLeague === "all" || c.leagueId === selectedLeague;
  const activeClubs = useMemo(() => clubs.filter(isActive), [clubs, selectedLeague]);

  // Scales: domain over ALL clubs so the axes stay stable and ghosting preserves
  // the full distribution shape. Both axes oriented so "good" is toward top-right.
  const { x, y, xMean, yMean } = useMemo(() => {
    const iw = width - MARGIN.left - MARGIN.right;
    const ih = height - MARGIN.top - MARGIN.bottom;
    const pad = (e: [number, number]) => {
      const span = e[1] - e[0] || 1;
      return [e[0] - span * 0.08, e[1] + span * 0.08] as [number, number];
    };
    const xDom = pad(d3.extent(clubs, (c) => c.stats[xKey]) as [number, number]);
    const yDom = pad(d3.extent(clubs, (c) => c.stats[yKey]) as [number, number]);
    const x = d3.scaleLinear()
      .domain(xMetric.higherIsBetter ? xDom : [xDom[1], xDom[0]])
      .range([MARGIN.left, MARGIN.left + iw]);
    const y = d3.scaleLinear()
      .domain(yMetric.higherIsBetter ? yDom : [yDom[1], yDom[0]])
      .range([MARGIN.top + ih, MARGIN.top]);
    // reference lines at the mean of the active set
    const xMean = d3.mean(activeClubs, (c) => c.stats[xKey]) ?? 0;
    const yMean = d3.mean(activeClubs, (c) => c.stats[yKey]) ?? 0;
    return { x, y, xMean, yMean };
  }, [clubs, activeClubs, width, xKey, yKey, xMetric, yMetric]);

  // Extremes worth labelling permanently (within the active set).
  const labelled = useMemo(() => {
    if (activeClubs.length === 0) return new Set<string>();
    const bestY = d3.greatest(activeClubs, (c) =>
      yMetric.higherIsBetter ? c.stats[yKey] : -c.stats[yKey]);
    const bestX = d3.greatest(activeClubs, (c) =>
      xMetric.higherIsBetter ? c.stats[xKey] : -c.stats[xKey]);
    // "elite corner" leader: best combined, normalised toward the good direction
    const norm = (v: number, dom: [number, number], good: boolean) => {
      const t = (v - dom[0]) / (dom[1] - dom[0] || 1);
      return good ? t : 1 - t;
    };
    const xe = d3.extent(activeClubs, (c) => c.stats[xKey]) as [number, number];
    const ye = d3.extent(activeClubs, (c) => c.stats[yKey]) as [number, number];
    const elite = d3.greatest(activeClubs, (c) =>
      norm(c.stats[xKey], xe, xMetric.higherIsBetter) +
      norm(c.stats[yKey], ye, yMetric.higherIsBetter));
    return new Set([bestY?.id, bestX?.id, elite?.id].filter(Boolean) as string[]);
  }, [activeClubs, xKey, yKey, xMetric, yMetric]);

  const xTicks = x.ticks(6);
  const yTicks = y.ticks(6);
  const hovered = hoverId ? clubs.find((c) => c.id === hoverId) ?? null : null;
  // animation nonce: restart entry stagger when the filter or axes change
  const nonce = `${selectedLeague}|${xKey}|${yKey}`;

  // Both axes are oriented so "good" is up and to the right, so that reading
  // always holds. The default attack-vs-defence pairing gets a concrete clause
  // and the four football quadrant tags; other pairings keep the two generic
  // tags (top-right good/good, bottom-left bad/bad).
  const isAttackDefence = yKey === "xG" && xKey === "xGA";
  const avgWord = selectedLeague === "all" ? "Big Five" : "league";
  const subtitle = isAttackDefence
    ? "Up and to the right is better: clubs higher up create more chances, clubs further right give up fewer."
    : `Up and to the right is better on both measures; the lines mark the ${avgWord} average.`;

  return (
    <div className="ccc glass glass--hero">
      <div className="ccc__head">
        <h2 className="display ccc__title">Who's dangerous, and who's solid at the back</h2>
        <p className="ccc__subtitle">{subtitle}</p>
        <div className="ccc__sentence">
          Comparing{" "}
          <MetricPicker value={yKey} onChange={setYKey} ariaLabel="Vertical measure (attack)" />{" "}
          against{" "}
          <MetricPicker value={xKey} onChange={setXKey} ariaLabel="Horizontal measure (defence)" />
        </div>
      </div>

      <div className="ccc__plot" ref={wrapRef}>
      <svg width={width} height={height} className={`ccc__svg ${hoverId ? "is-hovering" : ""}`}
           role="img"
           aria-label={`Scatter of ${activeClubs.length} clubs, ${yMetric.label} against ${xMetric.label}. Click a club to open it.`}>
        {/* faint gridlines, one hairline per tick */}
        <g className="ccc__grid">
          {xTicks.map((t) => (
            <line key={`gx${t}`} x1={x(t)} x2={x(t)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
          ))}
          {yTicks.map((t) => (
            <line key={`gy${t}`} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
          ))}
        </g>

        {/* league-mean quadrant reference lines, with plain pundit tags */}
        <g className="ccc__ref">
          <line x1={x(xMean)} x2={x(xMean)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(yMean)} y2={y(yMean)} />
          <text x={width - MARGIN.right - 8} y={MARGIN.top + 14} textAnchor="end" className="ccc__quad">Elite</text>
          <text x={MARGIN.left + 8} y={height - MARGIN.bottom - 8} className="ccc__quad">Struggling</text>
          {isAttackDefence && (
            <>
              <text x={MARGIN.left + 8} y={MARGIN.top + 14} textAnchor="start" className="ccc__quad">All-out attack</text>
              <text x={width - MARGIN.right - 8} y={height - MARGIN.bottom - 8} textAnchor="end" className="ccc__quad">Defensive</text>
            </>
          )}
          <text x={x(xMean) + 4} y={height - MARGIN.bottom - 4} className="ccc__reflabel">avg</text>
        </g>

        {/* axis ticks */}
        <g className="ccc__ticks">
          {xTicks.map((t) => (
            <text key={`tx${t}`} x={x(t)} y={height - MARGIN.bottom + 18} textAnchor="middle">
              {xMetric.format ? xMetric.format(t) : t}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={`ty${t}`} x={MARGIN.left - 12} y={y(t) + 4} textAnchor="end">
              {yMetric.format ? yMetric.format(t) : t}
            </text>
          ))}
        </g>
        <text x={MARGIN.left + (width - MARGIN.left - MARGIN.right) / 2} y={height - 10}
              className="ccc__axis-label" textAnchor="middle">
          {xMetric.label}{!xMetric.higherIsBetter ? "  (better →)" : ""}
        </text>
        <text transform={`translate(18 ${MARGIN.top + (height - MARGIN.top - MARGIN.bottom) / 2}) rotate(-90)`}
              className="ccc__axis-label" textAnchor="middle">
          {yMetric.label}
        </text>

        {/* crosshair guides for the hovered mark */}
        {hovered && (
          <g className="ccc__crosshair">
            <line x1={x(hovered.stats[xKey])} x2={x(hovered.stats[xKey])}
                  y1={y(hovered.stats[yKey])} y2={height - MARGIN.bottom} />
            <line x1={MARGIN.left} x2={x(hovered.stats[xKey])}
                  y1={y(hovered.stats[yKey])} y2={y(hovered.stats[yKey])} />
          </g>
        )}

        {/* marks */}
        <g key={nonce} className="ccc__marks">
          {clubs.map((c, i) => {
            const active = isActive(c);
            const cx = x(c.stats[xKey]);
            const cy = y(c.stats[yKey]);
            const isHover = hoverId === c.id;
            const isLabel = labelled.has(c.id) && active;
            const cls = [
              "ccc__mark",
              !active ? "is-ghost" : "",
              isHover ? "is-hover" : "",
              isLabel ? "is-label" : "",
            ].join(" ");
            return (
              <g key={c.id} className={cls} transform={`translate(${cx} ${cy})`}
                 style={{ ["--i" as string]: Math.min(i, 96) }}
                 tabIndex={active ? 0 : -1}
                 role="button"
                 aria-label={`${c.name}, ${yMetric.label} ${c.stats[yKey]}, ${xMetric.label} ${c.stats[xKey]}. Open club.`}
                 onMouseEnter={() => active && setHoverId(c.id)}
                 onMouseLeave={() => setHoverId(null)}
                 onFocus={() => active && setHoverId(c.id)}
                 onBlur={() => setHoverId(null)}
                 onClick={() => active && navigate(`/club/${c.id}`)}
                 onKeyDown={(e) => { if (active && e.key === "Enter") navigate(`/club/${c.id}`); }}>
                {/* forgiving invisible hit area */}
                <circle r={14} className="ccc__hit" />
                <circle className="ccc__dot" />
                {isLabel && !isHover && (
                  <text className="ccc__mark-label" x={8} y={3}>{shortName(c.name)}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && (
        <div className="ccc__tip glass" style={tipStyle(x(hovered.stats[xKey]), y(hovered.stats[yKey]), width)}>
          <div className="ccc__tip-name display">{hovered.name}</div>
          <div className="ccc__tip-pos mono">#{hovered.stats.position} · {hovered.stats.points} pts</div>
          <dl className="ccc__tip-grid">
            <div>
              <dt>{yMetric.plain}{yMetric.gloss && <span className="ccc__tip-gloss">{yMetric.gloss}</span>}</dt>
              <dd className="mono">{fmt(yMetric, hovered.stats[yKey])}</dd>
            </div>
            <div>
              <dt>{xMetric.plain}{xMetric.gloss && <span className="ccc__tip-gloss">{xMetric.gloss}</span>}</dt>
              <dd className="mono">{fmt(xMetric, hovered.stats[xKey])}</dd>
            </div>
            <div><dt>Scored</dt><dd className="mono">{hovered.stats.goalsFor}</dd></div>
            <div><dt>Conceded</dt><dd className="mono">{hovered.stats.goalsAgainst}</dd></div>
          </dl>
          <div className="ccc__tip-cta">Click to open →</div>
        </div>
      )}
      </div>
      <p className="ccc__hint">
        {activeClubs.length} clubs · marks are monochrome until hovered; the crosshair lines mark the
        {selectedLeague === "all" ? " Big Five" : " league"} average. Click any mark to open it.
      </p>
    </div>
  );
}

function fmt(m: MetricDef, v: number): string {
  return m.format ? m.format(v) : String(v);
}

function shortName(name: string): string {
  // keep it compact for leader labels
  return name.length > 16 ? name.slice(0, 15) + "…" : name;
}

function tipStyle(sx: number, sy: number, width: number): React.CSSProperties {
  const onRight = sx > width / 2;
  return {
    left: onRight ? undefined : sx + 18,
    right: onRight ? width - sx + 18 : undefined,
    top: Math.max(8, sy - 20),
  };
}
