import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ClubLight } from "../lib/types";
import Sparkline from "./Sparkline";
import "./LeagueTable.css";

interface Props {
  clubs: ClubLight[]; // the active (filtered) clubs
  selectedLeague: string;
  highlightId: string | null;
  onHover: (id: string | null) => void;
}

// A compact ranked table that shares selection and hover state with the scatter,
// so hovering a row highlights the matching mark and vice versa.
export default function LeagueTable({ clubs, selectedLeague, highlightId, onHover }: Props) {
  const navigate = useNavigate();

  const rows = useMemo(() => {
    const list = [...clubs];
    if (selectedLeague === "all") {
      list.sort((a, b) => b.stats.points - a.stats.points || b.stats.xGDiff - a.stats.xGDiff);
      return list.map((c, i) => ({ club: c, rank: i + 1 }));
    }
    list.sort((a, b) => a.stats.position - b.stats.position);
    return list.map((c) => ({ club: c, rank: c.stats.position }));
  }, [clubs, selectedLeague]);

  return (
    <div className="lt panel">
      <div className="lt__head">
        <div className="eyebrow">Standings</div>
        <h2 className="display lt__title">{selectedLeague === "all" ? "All clubs by points" : "League table"}</h2>
      </div>

      <div className="lt__cols" aria-hidden>
        <span>#</span><span>Club</span><span className="lt__num">Pts</span>
        <span className="lt__num" title="Scoring threat (expected goals, xG)">xG</span>
        <span className="lt__num" title="Defensive solidity (expected goals against, xGA)">xGA</span>
        <span title="xG margin over the last five matches">Form</span>
      </div>

      <div className="lt__rows" role="list">
        {rows.map(({ club, rank }) => {
          const on = highlightId === club.id;
          return (
            <div key={club.id} role="listitem"
                 className={`lt__row ${on ? "is-on" : ""}`}
                 tabIndex={0}
                 aria-label={`${club.name}, ${club.stats.points} points, xG ${club.stats.xG}, xGA ${club.stats.xGA}. Open club.`}
                 onMouseEnter={() => onHover(club.id)}
                 onMouseLeave={() => onHover(null)}
                 onFocus={() => onHover(club.id)}
                 onBlur={() => onHover(null)}
                 onClick={() => navigate(`/club/${club.id}`)}
                 onKeyDown={(e) => { if (e.key === "Enter") navigate(`/club/${club.id}`); }}>
              <span className="lt__rank mono">{rank}</span>
              <span className="lt__name">
                <i className="lt__dot" style={{ background: club.crestColor }} aria-hidden />
                {club.name}
              </span>
              <span className="lt__num mono">{club.stats.points}</span>
              <span className="lt__num mono">{club.stats.xG.toFixed(1)}</span>
              <span className="lt__num mono">{club.stats.xGA.toFixed(1)}</span>
              <span className="lt__spark"><Sparkline values={club.spark} accent={on} width={54} height={16} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
