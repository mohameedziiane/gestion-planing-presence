"use client";

import { useEffect, useState } from "react";

import {
  applyTheme,
  getInitialTheme,
  getNextTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="M4.93 4.93l1.77 1.77" />
      <path d="M17.3 17.3l1.77 1.77" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="M4.93 19.07l1.77-1.77" />
      <path d="M17.3 6.7l1.77-1.77" />
    </svg>
  );
}

export default function ThemeToggleButton() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const nextTheme = getNextTheme(theme);
  const ariaLabel =
    nextTheme === "dark"
      ? "Activer le mode sombre"
      : "Activer le mode clair";

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleClick() {
    applyTheme(nextTheme);
    setTheme(nextTheme);
    persistTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/60"
    >
      {nextTheme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
