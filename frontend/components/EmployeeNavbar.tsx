"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import ThemeToggleButton from "@/components/ThemeToggleButton";
import UserMenu from "@/components/UserMenu";
import FloatingMessages from "@/components/FloatingMessages";
import NotificationBell from "@/components/NotificationBell";
import type { StoredUser } from "@/lib/auth";

type EmployeeNavbarProps = {
  user?: StoredUser | null;
  onLogout: () => void;
};

const navItems = [
  { href: "/employe", label: "Pointage" },
  { href: "/employe/planning", label: "Planning" },
  { href: "/employe/absences", label: "Mes absences" },
  { href: "/employe/conges", label: "Mes congés" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href;
}

export default function EmployeeNavbar({ user, onLogout }: EmployeeNavbarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
          href="/employe"
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
          <UserMenu
            user={user}
            onLogout={onLogout}
            showThemeToggle={false}
            profileHref="/employe/profile"
          />
          </div>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] md:hidden">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 py-2">
            {navItems.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`border-l-2 px-3 py-3 text-sm font-semibold transition hover:text-[var(--color-text)] ${
                    isActive
                      ? "border-[var(--color-accent)] bg-[var(--color-surface-muted)] text-[var(--color-accent)]"
                      : "border-transparent text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="border-l-2 border-transparent px-3 py-3">
              <ThemeToggleButton />
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mx-auto hidden min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 md:flex">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 lg:gap-6">
          <Link href="/employe" className="flex shrink-0 items-center gap-3">
          <Image
            src="/logo.png"
            alt="Gare Routiere de Taza"
            width={48}
            height={48}
            priority
            className="h-12 w-12 object-contain"
          />
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Gare Routière de Taza</p>
          </div>
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-2 px-2.5 py-2 text-sm font-semibold transition sm:px-3 ${
                    item.href === "/employe" ? "mr-3" : ""
                  } ${
                    isActive
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
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
            onLogout={onLogout}
            showThemeToggle={false}
            profileHref="/employe/profile"
          />
          </div>
        </div>
      </nav>
    </header>
    <div aria-hidden="true" className="h-[72px] md:h-[78px]" />
    <FloatingMessages role="employe" user={user} />
    </>
  );
}
