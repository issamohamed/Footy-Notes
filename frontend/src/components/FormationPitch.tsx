import { useState } from "react";
import type { ClubDetail, Player } from "../lib/types";
import { POSITION_GROUP_COLORS } from "../lib/metrics";
import "./FormationPitch.css";

interface Props {
  club: ClubDetail;
}

// SVG pitch drawn in a 100 x 100 viewBox space matching the pipeline's x/y.
// x 0..100 left->right, y 0..100 own goal->opponent goal. We flip y for SVG.
const W = 100;
const H = 100;
const y2svg = (y: number) => H - y; // pipeline y up-field -> svg y down

export default function FormationPitch({ club }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const byId = new Map(club.players.map((p) => [p.id, p]));

  return (
    <div className="pitch glass glass--hero">
      <div className="pitch__head">
        <div>
          <div className="eyebrow">Best XI · tactics board</div>
          <h2 className="display pitch__formation">{club.formation}</h2>
        </div>
        <p className="pitch__note">
          Most-used shape; XI is each line's highest-minutes player. Left/right within a
          line is by minutes, not a claim from the data.
          {club.formationIsFallback && " Formation fell back to a default."}
        </p>
      </div>

      <div className="pitch__frame">
        <svg viewBox="-4 -4 108 108" className="pitch__svg" role="img"
             aria-label={`${club.name} best XI in a ${club.formation}`}>
          <defs>
            <radialGradient id="turf" cx="50%" cy="34%" r="80%">
              <stop offset="0%" stopColor="rgba(38,86,74,0.55)" />
              <stop offset="100%" stopColor="rgba(10,32,28,0.35)" />
            </radialGradient>
            <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* pitch surface */}
          <rect x="0" y="0" width={W} height={H} rx="2.5" className="pitch__grass" fill="url(#turf)" />
          {/* markings */}
          <g className="pitch__lines">
            <rect x="0" y="0" width={W} height={H} rx="2.5" />
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} />
            <circle cx={W / 2} cy={H / 2} r="9" />
            <circle cx={W / 2} cy={H / 2} r="0.8" className="pitch__spot" />
            {/* opponent goal box (top) */}
            <rect x="30" y="0" width="40" height="14" />
            <rect x="41" y="0" width="18" height="5.5" />
            {/* own goal box (bottom) */}
            <rect x="30" y={H - 14} width="40" height="14" />
            <rect x="41" y={H - 5.5} width="18" height="5.5" />
          </g>

          {/* player nodes */}
          {club.bestXI.map((slot) => {
            const p = byId.get(slot.playerId);
            if (!p) return null;
            const color = POSITION_GROUP_COLORS[p.positionGroup] ?? "var(--accent)";
            const cx = slot.x;
            const cy = y2svg(slot.y);
            const active = hover === slot.playerId;
            return (
              <g key={slot.playerId} transform={`translate(${cx} ${cy})`}
                 className={`pitch__node ${active ? "is-active" : ""}`}
                 tabIndex={0}
                 role="button"
                 aria-label={`${p.name}, ${slot.position}, ${p.minutes} minutes, ${p.goals} goals, ${p.assists} assists`}
                 onMouseEnter={() => setHover(slot.playerId)}
                 onMouseLeave={() => setHover(null)}
                 onFocus={() => setHover(slot.playerId)}
                 onBlur={() => setHover(null)}>
                <circle r="4.6" className="pitch__node-halo" style={{ fill: color }} />
                <circle r="2.9" className="pitch__node-dot" style={{ fill: color }} filter="url(#nodeGlow)" />
                <text y="7.6" className="pitch__node-label" textAnchor="middle">
                  {lastName(p.name)}
                </text>
                <text y="-5.2" className="pitch__node-slot" textAnchor="middle">{slot.position}</text>
              </g>
            );
          })}
        </svg>

        {hover && byId.get(hover) && <StatCard p={byId.get(hover)!} />}
      </div>

      <div className="pitch__legend">
        {(["GK", "DEF", "MID", "FWD"] as const).map((g) => (
          <span key={g} className="pitch__legend-item">
            <i style={{ background: POSITION_GROUP_COLORS[g] }} /> {g}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({ p }: { p: Player }) {
  return (
    <div className="pitch__card glass">
      <div className="pitch__card-name display">{p.name}</div>
      <div className="pitch__card-sub mono">{p.positionGroup} · {p.minutes.toLocaleString()} min</div>
      <dl className="pitch__card-grid">
        <div><dt>Goals</dt><dd className="mono">{p.goals}</dd></div>
        <div><dt>Assists</dt><dd className="mono">{p.assists}</dd></div>
        <div><dt>xG</dt><dd className="mono">{p.xG.toFixed(1)}</dd></div>
        <div><dt>xA</dt><dd className="mono">{p.xA.toFixed(1)}</dd></div>
      </dl>
    </div>
  );
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
