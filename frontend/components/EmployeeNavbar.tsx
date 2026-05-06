"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

function getEmployeeName(user: StoredUser | null | undefined) {
  const name = [user?.employe?.prenom, user?.employe?.nom]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || user?.email || "Employé";
}

function isActivePath(pathname: string, href: string) {
  return pathname === href;
}

export default function EmployeeNavbar({ user, onLogout }: EmployeeNavbarProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
      <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/employe" className="flex items-center gap-3">
          <Image
            src="/logo.webp"
            alt="Gare Routiere de Taza"
            width={48}
            height={48}
            priority
            className="h-12 w-12 object-contain"
          />
          <div>
            <p className="text-sm font-semibold text-[#e1e3e4]">
              Espace employé
            </p>
            <p className="text-xs text-[#acbdc5]">Gare Routière de Taza</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-2.5 py-2 text-sm font-semibold transition sm:px-3 ${
                  isActive
                    ? "border-[#1AB6FF] text-[#e1e3e4]"
                    : "border-transparent text-[#acbdc5] hover:text-[#e1e3e4]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <span className="text-sm font-semibold text-[#e1e3e4]">
            {getEmployeeName(user)}
          </span>
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
