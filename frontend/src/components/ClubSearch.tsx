import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClubs } from "../lib/data";
import { buildIndex, search, type Indexed } from "../lib/search";
import { LEAGUE_NAMES } from "../lib/metrics";
import type { ClubLight } from "../lib/types";
import "./ClubSearch.css";

// A reusable command-palette jump-to-club. Renders a masthead trigger pill and,
// when open, an accessible modal palette. Cmd/Ctrl+K or "/" opens it from
// anywhere. Selecting a result navigates to that club's page.
export default function ClubSearch() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<Indexed[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    getClubs().then((c) => setIndex(buildIndex(c))).catch(() => setIndex([]));
  }, []);

  const results = useMemo(() => search(index, query, 8), [index, query]);

  const openPalette = useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    // restore focus to whatever opened it
    requestAnimationFrame(() => triggerRef.current?.focus?.());
  }, []);

  const choose = useCallback((club: ClubLight | undefined) => {
    if (!club) return;
    setOpen(false);
    navigate(`/club/${club.id}`);
  }, [navigate]);

  // global open shortcuts: Cmd/Ctrl+K and "/"
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        if (!open) openPalette();
        return;
      }
      if (e.key === "/" && !open && !isTyping(e.target)) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  // focus the input when opened
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // keep the active row clamped and scrolled into view
  useEffect(() => { if (active >= results.length) setActive(0); }, [results, active]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onDialogKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Tab") { e.preventDefault(); } // trap focus in the input
  };

  const count = results.length;
  const announce = query
    ? `${count} club${count === 1 ? "" : "s"} match`
    : `${count} top clubs`;

  return (
    <>
      <button className="cs-trigger" onClick={openPalette}
              aria-label="Search clubs" aria-keyshortcuts="Meta+K Control+K">
        <SearchGlyph />
        <span className="cs-trigger__label">Search</span>
        <span className="cs-trigger__kbd mono">⌘K</span>
      </button>

      {open && (
        <div className="cs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closePalette(); }}>
          <div className="cs-panel glass" role="dialog" aria-modal="true" aria-label="Search clubs">
            <div className="cs-inputwrap">
              <SearchGlyph />
              <input ref={inputRef} className="cs-input" type="text" value={query}
                     onKeyDown={onDialogKey}
                     onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                     placeholder="Search clubs" aria-label="Search clubs"
                     role="combobox" aria-expanded="true" aria-controls="cs-listbox"
                     aria-autocomplete="list"
                     aria-activedescendant={count ? `cs-opt-${active}` : undefined}
                     autoComplete="off" spellCheck={false} />
              <kbd className="cs-esc mono">esc</kbd>
            </div>

            {!query && <div className="cs-section">Top clubs</div>}

            {count === 0 ? (
              <div className="cs-empty">No club matches that.</div>
            ) : (
              <ul className="cs-list" id="cs-listbox" role="listbox" aria-label="Clubs" ref={listRef}>
                {results.map((club, i) => (
                  <li key={club.id} id={`cs-opt-${i}`} data-idx={i}
                      role="option" aria-selected={i === active}
                      className={`cs-opt ${i === active ? "is-active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => { e.preventDefault(); choose(club); }}>
                    <span className="cs-opt__dot" style={{ background: club.crestColor }} aria-hidden />
                    <span className="cs-opt__name">{club.name}</span>
                    <span className="cs-opt__meta mono">
                      {LEAGUE_NAMES[club.leagueId] ?? ""} · {club.stats.points} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="cs-foot">
              <span className="cs-hint"><kbd className="mono">↑</kbd><kbd className="mono">↓</kbd> navigate</span>
              <span className="cs-hint"><kbd className="mono">↵</kbd> open</span>
              <span className="cs-hint"><kbd className="mono">esc</kbd> close</span>
            </div>

            <div className="cs-sr" role="status" aria-live="polite">{announce}</div>
          </div>
        </div>
      )}
    </>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function SearchGlyph() {
  return (
    <svg className="cs-glyph" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden focusable="false">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="10" y1="10" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
