"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api";
import {
  getStoredUser,
  getUserAvatarUrl,
  setStoredUser,
  type StoredUser,
} from "@/lib/auth";
import {
  applyTheme,
  getInitialTheme,
  getNextTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";

type UserMenuProps = {
  user?: StoredUser | null;
  displayName?: string;
  role?: string | null;
  onLogout: () => void;
  showThemeToggle?: boolean;
  profileHref?: string | null;
};

function getDisplayName(
  user: StoredUser | null | undefined,
  displayName: string | undefined,
  role: string | null | undefined,
) {
  const providedName = displayName?.trim();

  if (providedName) {
    return providedName;
  }

  const employeeName = [user?.employe?.prenom, user?.employe?.nom]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (employeeName) {
    return employeeName;
  }

  if (user?.email) {
    return user.email;
  }

  if ((role ?? user?.role) === "admin") {
    return "Admin";
  }

  return "Utilisateur";
}

function getRoleLabel(role: string | null | undefined) {
  if (role === "admin") {
    return "Administrateur";
  }

  if (role === "employe") {
    return "Employ\u00e9";
  }

  if (role === "directeur") {
    return "Directeur";
  }

  return role || "Utilisateur";
}

function getAvatarLetter(displayName: string) {
  return displayName.trim().charAt(0).toUpperCase() || "U";
}

function resolveAvatarSrc(avatarUrl: string) {
  if (!avatarUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(avatarUrl) || avatarUrl.startsWith("blob:")) {
    return avatarUrl;
  }

  return `${API_BASE_URL}${avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`}`;
}

export default function UserMenu({
  user,
  displayName,
  role,
  onLogout,
  showThemeToggle = true,
  profileHref = null,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [avatarUrl, setAvatarUrl] = useState(() =>
    getUserAvatarUrl(user || getStoredUser())
  );
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resolvedDisplayName = getDisplayName(user, displayName, role);
  const resolvedRole = role ?? user?.role;
  const roleLabel = getRoleLabel(resolvedRole);
  const avatarLetter = getAvatarLetter(resolvedDisplayName);
  const avatarSrc = !avatarLoadFailed ? resolveAvatarSrc(avatarUrl) : "";
  const themeToggleLabel = theme === "dark" ? "Mode clair" : "Mode sombre";

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    setAvatarUrl(getUserAvatarUrl(user || getStoredUser()));
    setAvatarLoadFailed(false);
  }, [user]);

  useEffect(() => {
    function syncAvatarFromStoredUser() {
      setAvatarUrl(getUserAvatarUrl(getStoredUser()));
      setAvatarLoadFailed(false);
    }

    window.addEventListener("auth:user-updated", syncAvatarFromStoredUser);
    window.addEventListener("storage", syncAvatarFromStoredUser);

    return () => {
      window.removeEventListener("auth:user-updated", syncAvatarFromStoredUser);
      window.removeEventListener("storage", syncAvatarFromStoredUser);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    let isActive = true;

    async function refreshCurrentUser() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { user?: StoredUser };

        if (!isActive || !payload.user) {
          return;
        }

        setStoredUser(payload.user);
      } catch {
        // Keep the letter fallback if the profile endpoint is unavailable.
      }
    }

    refreshCurrentUser();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleThemeToggle() {
    const nextTheme = getNextTheme(theme);

    applyTheme(nextTheme);
    setTheme(nextTheme);
    persistTheme(nextTheme);
  }

  return (
    <div
      ref={menuRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      className="relative shrink-0"
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-1.5 text-[var(--color-text)] transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/60"
      >
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent)] text-sm font-bold text-[#16252d] transition hover:bg-[var(--color-accent-hover)]">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            avatarLetter
          )}
        </span>
        <span
          aria-hidden="true"
          className={`text-xs text-[var(--color-text-muted)] transition ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          {"\u25be"}
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 w-60 pt-2">
          <span className="absolute right-5 top-1 h-3 w-3 rotate-45 border-l border-t border-[var(--color-border)] bg-[var(--color-surface)]" />
          <div
            role="menu"
            className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/30"
          >
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                {resolvedDisplayName}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-[var(--color-text-muted)]">
                {roleLabel}
              </p>
            </div>

            {showThemeToggle ? (
              <button
                type="button"
                role="menuitem"
                onClick={handleThemeToggle}
                className="w-full border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]/60"
              >
                {themeToggleLabel}
              </button>
            ) : null}

            {profileHref ? (
              <Link
                href={profileHref}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="block w-full border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]/60"
              >
                Edit Profile
              </Link>
            ) : null}

            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="w-full bg-[var(--color-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]/60"
            >
              Déconnexion
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
