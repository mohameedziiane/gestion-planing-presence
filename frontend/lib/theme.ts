export type ThemeMode = "dark" | "light";

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedTheme = window.localStorage.getItem("theme");
    return isThemeMode(storedTheme) ? storedTheme : "dark";
  } catch {
    return "dark";
  }
}

export function getNextTheme(theme: ThemeMode): ThemeMode {
  return theme === "dark" ? "light" : "dark";
}

export function persistTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem("theme", theme);
  } catch {
    // Ignore storage failures; the active document theme was already updated.
  }
}
