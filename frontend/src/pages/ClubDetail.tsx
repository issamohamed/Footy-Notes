import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getClubDetail } from "../lib/data";
import type { ClubDetail as ClubDetailType } from "../lib/types";
import FormationPitch from "../components/FormationPitch";
import PlayerStatsChart from "../components/PlayerStatsChart";
import FormLineChart from "../components/FormLineChart";
import TransferBento from "../components/TransferBento";
import StatCard from "../components/StatCard";
import ClubSearch from "../components/ClubSearch";
import ThemeToggle from "../components/ThemeToggle";
import "./ClubDetail.css";

function cumulative(vals: number[]): number[] {
  let acc = 0;
  return vals.map((v) => (acc += v));
}
function rolling(vals: number[], w = 5): number[] {
  return vals.map((_, i) => {
    const s = vals.slice(Math.max(0, i - w + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

export default function ClubDetail() {
  const { clubId } = useParams<{ clubId: string }>();
  const [club, setClub] = useState<ClubDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClub(null);
    setError(null);
    if (!clubId) return;
    getClubDetail(clubId).then(setClub).catch((e) => setError(String(e)));
  }, [clubId]);

  const sparks = useMemo(() => {
    if (!club) return null;
    const m = club.matches;
    return {
      points: cumulative(m.map((x) => x.pts)),
      gd: cumulative(m.map((x) => x.gf - x.ga)),
      xG: rolling(m.map((x) => x.xG)),
      xGA: rolling(m.map((x) => x.xGA)),
    };
  }, [club]);

  if (error) {
    return (
      <div className="ground"><div className="shell">
        <Link to="/" className="cd-back">← Back to overview</Link>
        <div className="panel load-card"><p className="load-msg">Club not found.</p></div>
      </div></div>
    );
  }

  if (!club || !sparks) {
    return (
      <div className="ground"><div className="shell">
        <Link to="/" className="cd-back">← Back to overview</Link>
        <div className="panel load-card"><p className="load-msg">Loading club…</p></div>
      </div></div>
    );
  }

  const s = seasonStatsFromMatches(club);

  return (
    <div className="ground">
      <div className="shell">
        <div className="cd-topbar">
          <Link to="/" className="cd-back">← Back to overview</Link>
          <div className="cd-topbar__right">
            <ClubSearch />
            <ThemeToggle />
          </div>
        </div>

        <header className="cd-hero" style={{ ["--club" as string]: club.crestColor }}>
          <span className="cd-crest" aria-hidden />
          <div>
            <div className="eyebrow">Club dashboard</div>
            <h1 className="display cd-title">{club.name}</h1>
            <div className="cd-meta mono">{club.formation} · {club.players.length} players used</div>
          </div>
        </header>

        <div className="cd-bento">
          <div className="cd-cell cd-cell--stats">
            <StatCard label="Points" value={String(s.points)} sub={`${s.wins}W ${s.draws}D ${s.losses}L`} spark={sparks.points} />
            <StatCard label="Goal diff" value={s.gd >= 0 ? `+${s.gd}` : String(s.gd)} sub={`${s.gf} for`} spark={sparks.gd} />
            <StatCard label="xG" value={s.xG.toFixed(1)} sub="created" spark={sparks.xG} accentSpark />
            <StatCard label="xGA" value={s.xGA.toFixed(1)} sub="conceded" spark={sparks.xGA} />
            <StatCard label="xG margin" value={s.xGDiff >= 0 ? `+${s.xGDiff.toFixed(1)}` : s.xGDiff.toFixed(1)} sub="season" />
          </div>

          <div className="cd-cell cd-cell--pitch">
            <FormationPitch club={club} />
          </div>

          <div className="cd-cell cd-cell--player">
            <PlayerStatsChart players={club.players} />
          </div>

          <div className="cd-cell cd-cell--form">
            <FormLineChart matches={club.matches} />
          </div>

          <div className="cd-cell cd-cell--transfers">
            <TransferBento clubId={club.id} transfers={club.transfers} />
          </div>
        </div>
      </div>
    </div>
  );
}

function seasonStatsFromMatches(club: ClubDetailType) {
  const m = club.matches;
  const sum = (f: (x: (typeof m)[number]) => number) => m.reduce((a, x) => a + f(x), 0);
  const gf = sum((x) => x.gf);
  const ga = sum((x) => x.ga);
  const xG = sum((x) => x.xG);
  const xGA = sum((x) => x.xGA);
  return {
    points: sum((x) => x.pts),
    wins: m.filter((x) => x.res === "W").length,
    draws: m.filter((x) => x.res === "D").length,
    losses: m.filter((x) => x.res === "L").length,
    gf, ga, gd: gf - ga,
    xG, xGA, xGDiff: xG - xGA,
  };
}
