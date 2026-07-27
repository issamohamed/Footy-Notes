import Sparkline from "./Sparkline";
import "./StatCard.css";

interface Props {
  label: string;
  value: string;
  sub?: string;
  spark?: number[];
  accentSpark?: boolean;
  variant?: "number" | "name"; // number = big tabular figure; name = smaller display text
  onClick?: () => void;
}

// Small bento cell: a quiet label, one figure (or a club name), and an optional
// sparkline showing that metric's season trajectory.
export default function StatCard({ label, value, sub, spark, accentSpark, variant = "number", onClick }: Props) {
  const clickable = !!onClick;
  return (
    <div className={`stat-card panel ${clickable ? "is-clickable" : ""}`}
         role={clickable ? "button" : undefined}
         tabIndex={clickable ? 0 : undefined}
         onClick={onClick}
         onKeyDown={clickable ? (e) => { if (e.key === "Enter") onClick!(); } : undefined}>
      <div className="stat-card__label">{label}</div>
      <div className={`stat-card__value ${variant === "name" ? "stat-card__value--name display" : "mono"}`}>{value}</div>
      <div className="stat-card__foot">
        {sub && <span className="stat-card__sub mono">{sub}</span>}
        {spark && spark.length > 1 && (
          <span className="stat-card__spark"><Sparkline values={spark} accent={accentSpark} /></span>
        )}
      </div>
    </div>
  );
}
