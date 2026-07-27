import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { MatchPoint } from "../lib/types";
import "./FormLineChart.css";

interface Props {
  matches: MatchPoint[];
}

const WINDOW = 5;

function rolling(values: number[], w: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - w + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export default function FormLineChart({ matches }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const height = 240;
  const M = { top: 16, right: 18, bottom: 30, left: 34 };
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { xgRoll, xgaRoll, x, y } = useMemo(() => {
    const xgRoll = rolling(matches.map((m) => m.xG), WINDOW);
    const xgaRoll = rolling(matches.map((m) => m.xGA), WINDOW);
    const x = d3.scaleLinear().domain([1, matches.length]).range([M.left, width - M.right]);
    const maxY = Math.max(1, d3.max([...xgRoll, ...xgaRoll]) ?? 1);
    const y = d3.scaleLinear().domain([0, maxY * 1.12]).range([height - M.bottom, M.top]);
    return { xgRoll, xgaRoll, x, y };
  }, [matches, width]);

  if (matches.length < 2) {
    return (
      <div className="flc panel">
        <div className="flc__head"><div className="eyebrow">Form · rolling {WINDOW} matches</div></div>
        <p className="flc__empty">Not enough matches on record.</p>
      </div>
    );
  }

  const line = (vals: number[]) =>
    d3.line<number>().x((_, i) => x(i + 1)).y((v) => y(v)).curve(d3.curveMonotoneX)(vals) ?? "";

  const xTicks = matches.map((m) => m.md).filter((md) => md === 1 || md % 5 === 0);
  const yTicks = y.ticks(4);
  const hm = hoverIdx != null ? matches[hoverIdx] : null;

  return (
    <div className="flc panel">
      <div className="flc__head">
        <div>
          <div className="eyebrow">Form · rolling {WINDOW} matches</div>
          <h2 className="display flc__title">xG created vs conceded</h2>
        </div>
        <div className="flc__legend">
          <span className="flc__key"><i className="flc__swatch is-xg" /> xG</span>
          <span className="flc__key"><i className="flc__swatch is-xga" /> xGA</span>
        </div>
      </div>

      <div className="flc__wrap" ref={wrapRef}
           onMouseLeave={() => setHoverIdx(null)}
           onMouseMove={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const px = e.clientX - rect.left;
             const md = Math.round(x.invert(px));
             const idx = Math.min(matches.length - 1, Math.max(0, md - 1));
             setHoverIdx(idx);
           }}>
        <svg width={width} height={height} className="flc__svg" role="img"
             aria-label={`Rolling ${WINDOW} match average of xG and xGA across ${matches.length} matchdays`}>
          <g className="flc__grid">
            {yTicks.map((t) => <line key={t} x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />)}
          </g>
          <g className="flc__axis">
            {xTicks.map((t) => (
              <text key={`x${t}`} x={x(t)} y={height - M.bottom + 16} textAnchor="middle">{t}</text>
            ))}
            {yTicks.map((t) => (
              <text key={`y${t}`} x={M.left - 8} y={y(t) + 3} textAnchor="end">{t.toFixed(1)}</text>
            ))}
            <text className="flc__axistitle" x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle">MATCHDAY</text>
          </g>

          <path className="flc__line is-xga" d={line(xgaRoll)} />
          <path className="flc__line is-xg" d={line(xgRoll)} />

          {hm && hoverIdx != null && (
            <g className="flc__hover">
              <line x1={x(hm.md)} x2={x(hm.md)} y1={M.top} y2={height - M.bottom} />
              <circle cx={x(hm.md)} cy={y(xgaRoll[hoverIdx])} r={3} className="is-xga" />
              <circle cx={x(hm.md)} cy={y(xgRoll[hoverIdx])} r={3} className="is-xg" />
            </g>
          )}
        </svg>

        {hm && hoverIdx != null && (
          <div className="flc__tip glass" style={tipStyle(x(hm.md), width)}>
            <div className="flc__tip-md mono">MD {hm.md} · {hm.res} {hm.gf}-{hm.ga}</div>
            <div className="flc__tip-opp">vs {hm.opp}</div>
            <div className="flc__tip-vals mono">
              <span className="is-xg">xG {xgRoll[hoverIdx].toFixed(2)}</span>
              <span className="is-xga">xGA {xgaRoll[hoverIdx].toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function tipStyle(sx: number, width: number): React.CSSProperties {
  const onRight = sx > width / 2;
  return { left: onRight ? undefined : sx + 12, right: onRight ? width - sx + 12 : undefined, top: 8 };
}
