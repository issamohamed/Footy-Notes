import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildIndex, search } from "../lib/search";
import { LEAGUE_NAMES } from "../lib/metrics";
import type { ClubLight } from "../lib/types";
import "./HeroSearch.css";

interface Props {
  clubs: ClubLight[];
}

// The landing-page hero: a large centered search bar with an inline results
// dropdown and a voice button (Web Speech API). Typing filters live; selecting
// a result navigates to that club. Cmd/Ctrl+K focuses it.
export default function HeroSearch({ clubs }: Props) {
  const navigate = useNavigate();
  const index = useMemo(() => buildIndex(clubs), [clubs]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);

  const results = useMemo(() => (query.trim() ? search(index, query, 7) : []), [index, query]);
  const open = query.trim().length > 0 && !dismissed;

  const voiceSupported = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Cmd/Ctrl+K focuses the bar (the landing has no palette pill)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // close the dropdown when clicking outside the search
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setDismissed(true);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => () => { recogRef.current?.abort?.(); }, []);

  const choose = (club: ClubLight | undefined) => {
    if (!club) return;
    navigate(`/club/${club.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setQuery(""); inputRef.current?.blur(); }
  };

  const toggleVoice = () => {
    if (listening) { recogRef.current?.stop(); return; }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (ev: any) => {
      const t = Array.from(ev.results).map((x: any) => x[0].transcript).join("");
      setQuery(t);
      setActive(0);
      setDismissed(false);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    setDismissed(false);
    inputRef.current?.focus();
    r.start();
  };

  return (
    <div className="hs" ref={rootRef}>
      <div className={`hs-bar ${listening ? "is-listening" : ""}`}>
        <SearchGlyph />
        <input
          ref={inputRef}
          className="hs-input"
          type="text"
          value={query}
          placeholder="Search any club"
          aria-label="Search clubs"
          role="combobox"
          aria-expanded={open}
          aria-controls="hs-listbox"
          aria-autocomplete="list"
          aria-activedescendant={open && results.length ? `hs-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setDismissed(false); }}
          onKeyDown={onKeyDown}
        />
        {voiceSupported && (
          <button type="button"
                  className={`hs-mic ${listening ? "is-on" : ""}`}
                  aria-label={listening ? "Stop voice search" : "Search by voice"}
                  aria-pressed={listening}
                  onClick={toggleVoice}>
            <MicGlyph />
          </button>
        )}
      </div>

      {open && (
        <ul className="hs-results panel" id="hs-listbox" role="listbox" aria-label="Clubs">
          {results.length === 0 ? (
            <li className="hs-empty" role="presentation">No club matches that.</li>
          ) : (
            results.map((club, i) => (
              <li key={club.id} id={`hs-opt-${i}`} role="option" aria-selected={i === active}
                  className={`hs-opt ${i === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(club); }}>
                <span className="hs-opt__dot" style={{ background: club.crestColor }} aria-hidden />
                <span className="hs-opt__name">{club.name}</span>
                <span className="hs-opt__meta mono">{LEAGUE_NAMES[club.leagueId] ?? ""} · {club.stats.points} pts</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg className="hs-glyph" width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden focusable="false">
      <rect x="6" y="1.5" width="5" height="9" rx="2.5" fill="currentColor" />
      <path d="M3.5 8a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <line x1="8.5" y1="13" x2="8.5" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
