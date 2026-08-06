"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("vie-theme", nextTheme);
    setTheme(nextTheme);
  }

  const nextLabel = theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw";

  return (
    <button
      className={`theme-toggle ${compact ? "theme-toggle-compact" : ""}`}
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      {!compact ? <b>{theme === "dark" ? "Jasny" : "Ciemny"}</b> : null}
    </button>
  );
}
