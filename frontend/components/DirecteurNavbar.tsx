"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import ThemeToggleButton from "@/components/ThemeToggleButton";
import UserMenu from "@/components/UserMenu";
import NotificationBell from "@/components/NotificationBell";
import type { StoredUser } from "@/lib/auth";

type DirecteurNavbarProps = {
  user?: StoredUser | null;
  onLogout: () => void;
};

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  {
    href: "/directeur",
    label: "Accueil",
  },
  {
    href: "/directeur/employes",
    label: "Employés",
  },
  {
    href: "/directeur/presence",
    label: "Pr\u00e9sence",
  },
  {
    href: "/directeur/conges",
    label: "Congés",
  },
];

function getCurrentHash() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hash || "";
}

function isActiveItem(pathname: string, hash: string, item: NavItem) {
  if (item.href === "/directeur") {
    return pathname === "/directeur" && !hash;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function DirecteurNavbar({ user, onLogout }: DirecteurNavbarProps) {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = useState(getCurrentHash);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    function handleHashChange() {
      setActiveHash(getCurrentHash());
    }

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <>
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid min-h-[72px] w-full max-w-[1180px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
        >
          <span className="flex flex-col gap-1.5">
            <span className="h-0.5 w-5 bg-current" />
            <span className="h-0.5 w-5 bg-current" />
            <span className="h-0.5 w-5 bg-current" />
          </span>
        </button>

        <Link
          href="/directeur"
          onClick={() => setIsMobileMenuOpen(false)}
          className="flex min-w-0 items-center justify-center gap-2"
        >
          <Image
            src="/logo.png"
            alt="Gare Routiere de Taza"
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="truncate text-sm font-semibold text-[var(--color-text)]">
            Gare Routiere de Taza
          </span>
        </Link>

        <div className="flex items-center justify-end gap-4">
          <NotificationBell />
          <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <UserMenu
            user={user}
            displayName="Directeur"
            role="directeur"
            onLogout={onLogout}
            showThemeToggle={false}
            profileHref="/directeur/profile"
          />
          </div>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] md:hidden">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 py-2">
            {navItems.map((item) => {
              const isActive = isActiveItem(pathname, activeHash, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`border-l-2 px-3 py-3 text-sm font-semibold transition hover:text-[var(--color-text)] ${
                    isActive
                      ? "border-[var(--color-accent)] bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="mx-auto hidden min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 md:flex">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 lg:gap-6">
          <Link href="/directeur" className="flex shrink-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt="Gare Routiere de Taza"
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                Espace Directeur
              </p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">
                Gare Routiere de Taza
              </p>
            </div>
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const isActive = isActiveItem(pathname, activeHash, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-2 px-2.5 py-2 text-sm font-semibold transition hover:text-[var(--color-text)] sm:px-3 ${
                    isActive
                      ? "border-[var(--color-accent)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <NotificationBell />
          <div className="flex items-center gap-2">
          <ThemeToggleButton />
          <UserMenu
            user={user}
            displayName="Directeur"
            role="directeur"
            onLogout={onLogout}
            showThemeToggle={false}
            profileHref="/directeur/profile"
          />
          </div>
        </div>
      </nav>
    </header>
    <div aria-hidden="true" className="h-[72px] md:h-[78px]" />
    </>
  );
}
