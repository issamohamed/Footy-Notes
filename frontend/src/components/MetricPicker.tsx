import { useEffect, useRef, useState } from "react";
import { METRICS } from "../lib/metrics";
import type { MetricDef } from "../lib/types";
import "./MetricPicker.css";

interface Props {
  value: MetricDef["key"];
  onChange: (key: MetricDef["key"]) => void;
  ariaLabel: string;
}

// An inline dropdown used inside the "Comparing X against Y" sentence. Custom
// (not a native select) so each option can lead with a plain-language name and
// carry a quiet analytics gloss beneath it.
export default function MetricPicker({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = METRICS.find((m) => m.key === value) ?? METRICS[0];

  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, METRICS.findIndex((m) => m.key === value)));
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    requestAnimationFrame(() => menuRef.current?.focus());
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, value]);

  const choose = (key: MetricDef["key"]) => {
    onChange(key);
    setOpen(false);
    requestAnimationFrame(() => btnRef.current?.focus());
  };

  const onBtnKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(METRICS.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(METRICS[activeIdx].key); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === "Tab") { setOpen(false); }
  };

  return (
    <div className="mp" ref={rootRef}>
      <button ref={btnRef} type="button" className={`mp-trigger ${open ? "is-open" : ""}`}
              aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
              onClick={() => setOpen((o) => !o)} onKeyDown={onBtnKey}>
        <span className="mp-trigger__label">{selected.plain.toLowerCase()}</span>
        <svg className="mp-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
          <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="mp-menu panel" role="listbox" aria-label={ariaLabel} tabIndex={-1}
            ref={menuRef} onKeyDown={onMenuKey}
            aria-activedescendant={`mp-opt-${activeIdx}`}>
          {METRICS.map((m, i) => (
            <li key={m.key} id={`mp-opt-${i}`} role="option" aria-selected={m.key === value}
                className={`mp-opt ${i === activeIdx ? "is-active" : ""} ${m.key === value ? "is-selected" : ""}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(m.key); }}>
              <span className="mp-opt__plain">{m.plain}</span>
              {m.gloss && <span className="mp-opt__gloss">{m.gloss}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
