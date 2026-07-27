import type { League } from "../lib/types";
import "./LeagueToggle.css";

interface Props {
  leagues: League[];
  selected: string; // league id, or "all"
  onSelect: (id: string) => void;
}

export default function LeagueToggle({ leagues, selected, onSelect }: Props) {
  const options = [{ id: "all", name: "All Leagues" }, ...leagues];
  return (
    <div className="league-toggle panel" role="tablist" aria-label="League filter">
      {options.map((o) => {
        const active = o.id === selected;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            className={`league-toggle__opt ${active ? "is-active" : ""}`}
            onClick={() => onSelect(o.id)}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
