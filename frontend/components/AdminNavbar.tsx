"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminNavbarProps = {
  onLogout: () => void;
};

const navItems = [
  { href: "/admin", label: "Accueil" },
  { href: "/admin/planning", label: "Planning" },
  { href: "/admin/employes", label: "Employ\u00e9s" },
  { href: "/admin/repos", label: "Repos" },
  { href: "/admin/presence", label: "Pr\u00e9sence" },
  { href: "/admin/conges", label: "Cong\u00e9s" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNavbar({ onLogout }: AdminNavbarProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
      <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 lg:gap-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-3">
            <Image
              src="/logo.webp"
              alt="Gare Routiere de Taza"
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <span className="hidden text-sm font-semibold text-[#e1e3e4] sm:block">
              Gare Routiere de Taza
            </span>
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-2 px-2.5 py-2 text-sm font-semibold transition hover:text-[#e1e3e4] sm:px-3 ${
                    isActive
                      ? "border-[#1AB6FF] text-[#e1e3e4]"
                      : "border-transparent text-[#acbdc5]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-[#e1e3e4]">Admin</span>
          <button
            type="button"
            onClick={onLogout}
            className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
          >
            Logout
          </button>
        </div>
      </nav>
    </header>
  );
}
