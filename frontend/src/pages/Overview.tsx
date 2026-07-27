import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClubs, getLeagues } from "../lib/data";
import type { ClubLight, League } from "../lib/types";
import LeagueToggle from "../components/LeagueToggle";
import ClubComparisonChart from "../components/ClubComparisonChart";
import LeagueTable from "../components/LeagueTable";
import StatCard from "../components/StatCard";
import HeroSearch from "../components/HeroSearch";
import ThemeToggle from "../components/ThemeToggle";
import "./Overview.css";

export default function Overview() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [clubs, setClubs] = useState<ClubLight[]>([]);
  const [selected, setSelected] = useState("all");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getLeagues(), getClubs()])
      .then(([lg, cl]) => {
        const order = ["eng-premier-league", "esp-la-liga", "ita-serie-a", "ger-bundesliga", "fra-ligue-1"];
        lg.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        setLeagues(lg);
        setClubs(cl);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const active = useMemo(
    () => (selected === "all" ? clubs : clubs.filter((c) => c.leagueId === selected)),
    [clubs, selected]
  );

  const summary = useMemo(() => {
    if (active.length === 0) return null;
    const totXG = active.reduce((s, c) => s + c.stats.xG, 0);
    const topScore = active.reduce((a, c) => (c.stats.goalsFor > a.stats.goalsFor ? c : a));
    const tightest = active.reduce((a, c) => (c.stats.goalsAgainst < a.stats.goalsAgainst ? c : a));
    const bestXG = active.reduce((a, c) => (c.stats.xGDiff > a.stats.xGDiff ? c : a));
    return { totXG, topScore, tightest, bestXG };
  }, [active]);

  const surprise = () => {
    if (clubs.length === 0) return;
    const club = clubs[Math.floor(Math.random() * clubs.length)];
    navigate(`/club/${club.id}`);
  };

  if (error) return <div className="ground"><div className="shell"><p className="load-msg">Could not load data: {error}</p></div></div>;

  return (
    <div className="ground">
      <div className="shell">
        <div className="ov-top">
          <ThemeToggle />
        </div>

        <header className="ov-hero">
          <h1 className="ov-title">Footy Notes</h1>
          <HeroSearch clubs={clubs} />
          <button type="button" className="ov-surprise" onClick={surprise} disabled={clubs.length === 0}>
            Surprise me
            <span className="ov-surprise__arrow" aria-hidden>→</span>
          </button>
        </header>

        <div className="ov-controls">
          <LeagueToggle leagues={leagues} selected={selected} onSelect={setSelected} />
          <div className="ov-count mono">{active.length} clubs</div>
        </div>

        {summary && (
          <section className="ov-headline" aria-label="League summary">
            <StatCard label="Total xG" value={summary.totXG.toFixed(0)}
                      sub={selected === "all" ? "all five leagues" : "selected league"} />
            <StatCard variant="name" label="Highest scoring" value={summary.topScore.name}
                      sub={`${summary.topScore.stats.goalsFor} goals`}
                      onClick={() => navigate(`/club/${summary.topScore.id}`)} />
            <StatCard variant="name" label="Tightest defence" value={summary.tightest.name}
                      sub={`${summary.tightest.stats.goalsAgainst} conceded`}
                      onClick={() => navigate(`/club/${summary.tightest.id}`)} />
            <StatCard variant="name" label="Best xG margin" value={summary.bestXG.name}
                      sub={`+${summary.bestXG.stats.xGDiff.toFixed(1)} xG`}
                      onClick={() => navigate(`/club/${summary.bestXG.id}`)} />
            <StatCard label="Clubs" value={String(active.length)} sub="in view" />
          </section>
        )}

        {clubs.length === 0 ? (
          <div className="panel load-card"><p className="load-msg">Loading club telemetry…</p></div>
        ) : (
          <div className="ov-main">
            <ClubComparisonChart clubs={clubs} selectedLeague={selected}
                                 highlightId={highlightId} onHover={setHighlightId} />
            <LeagueTable clubs={active} selectedLeague={selected}
                         highlightId={highlightId} onHover={setHighlightId} />
          </div>
        )}
      </div>
    </div>
  );
}
