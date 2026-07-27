import { useEffect, useState } from "react";
import "./ThemeToggle.css";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" ? "light" : "dark";
}

// A small light/dark switch. The initial theme is applied by an inline script in
// index.html (before paint); this just flips and persists it.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="theme-toggle"
            onClick={() => setTheme(next)}
            aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === "dark" ? <SunGlyph /> : <MoonGlyph />}
    </button>
  );
}

function SunGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180;
        const x1 = 8 + Math.cos(r) * 5.2, y1 = 8 + Math.sin(r) * 5.2;
        const x2 = 8 + Math.cos(r) * 6.7, y2 = 8 + Math.sin(r) * 6.7;
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />;
      })}
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
