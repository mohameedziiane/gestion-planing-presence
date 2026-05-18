"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import EmployeeNavbar from "@/components/EmployeeNavbar";
import { apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
  type StoredUser,
} from "@/lib/auth";

type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe_id?: number | string;
};

type DayStatus = {
  date: string;
  planning: ApiRow[];
  repos: ApiRow[];
  presence: ApiRow[];
};

type WeekMode = "current" | "next";

const dayLabels = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

function addDays(dateValue: string, offset: number) {
  const date = parseLocalDate(dateValue);
  date.setDate(date.getDate() + offset);

  return formatDateValue(date);
}

function getCurrentWeekMonday() {
  const date = new Date();
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - daysSinceMonday);

  return formatDateValue(date);
}

function getWeekDates(mode: WeekMode) {
  const startDate =
    mode === "current"
      ? getCurrentWeekMonday()
      : addDays(getCurrentWeekMonday(), 7);

  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getString(row: ApiRow | null | undefined, keys: string[]) {
  if (!row) {
    return "";
  }

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function getShiftName(row: ApiRow) {
  return (
    getString(row, [
      "periode_travail",
      "periode_nom",
      "periode",
      "periode_name",
      "periodeTravail",
    ]) || "Non défini"
  );
}

function getRoleName(row: ApiRow) {
  return (
    getString(row, [
      "role_travail",
      "role_travail_nom",
      "role",
      "role_name",
      "roleTravail",
    ]) || "Rôle non défini"
  );
}

function getPresenceStatus(row: ApiRow | undefined) {
  return getString(row, ["statut", "status"]) || "";
}

function getArrivalTime(row: ApiRow | undefined) {
  return getString(row, ["heure_arrivee", "arrival_time"]) || "";
}

function getReposType(row: ApiRow | undefined) {
  return getString(row, ["type", "repos_type", "type_repos"]) || "Repos";
}

function getRows(payload: unknown) {
  return Array.isArray(payload) ? (payload as ApiRow[]) : [];
}

async function fetchDayStatus(date: string): Promise<DayStatus> {
  const [planning, repos, presence] = await Promise.all([
    apiFetch(`/api/planning/date/${date}`).then(getRows),
    apiFetch(`/api/repos/date/${date}`).then(getRows),
    apiFetch(`/api/presence/date/${date}`).then(getRows),
  ]);

  return {
    date,
    planning,
    repos,
    presence,
  };
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "yellow" | "red" | "muted";
}) {
  const classes = {
    green:
      "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]",
    yellow:
      "border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)]",
    red: "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
    muted:
      "border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] text-[var(--color-badge-text)]",
  };

  return (
    <span className={`inline-flex w-fit border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm font-semibold text-[var(--color-text-muted)]">
      {label}
    </section>
  );
}

function DayCard({ day, index }: { day: DayStatus; index: number }) {
  const reposRow = day.repos[0];
  const presenceRow = day.presence[0];
  const presenceStatus = normalizeText(getPresenceStatus(presenceRow));
  const hasPresentRecord = presenceStatus === normalizeText("Présent");
  const isRepos = day.repos.length > 0;
  const hasPlanning = day.planning.length > 0;

  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            {dayLabels[index]}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{day.date}</p>
        </div>
        {hasPresentRecord ? (
          <StatusBadge tone="green">Présent</StatusBadge>
        ) : isRepos ? (
          <StatusBadge tone="muted">Repos</StatusBadge>
        ) : hasPlanning ? (
          <StatusBadge tone="yellow">Non pointé</StatusBadge>
        ) : (
          <StatusBadge tone="red">No planning</StatusBadge>
        )}
      </div>

      {isRepos ? (
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Repos</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Type: {getReposType(reposRow)}</p>
        </div>
      ) : hasPlanning ? (
        <div className="space-y-3">
          {day.planning.map((row, rowIndex) => (
            <div
              key={row.id || `${day.date}-${rowIndex}`}
              className="border-l-2 border-[var(--color-accent)] bg-[var(--color-surface-muted)] px-3 py-3"
            >
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Travail: {getShiftName(row)}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{getRoleName(row)}</p>
            </div>
          ))}
          {hasPresentRecord ? (
            <p className="text-sm text-[var(--color-badge-success-text)]">
              Pointé à {getArrivalTime(presenceRow)}
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Présence non pointée.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Aucun planning pour cette date.</p>
      )}
    </article>
  );
}

export default function EmployePlanningPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [weekMode, setWeekMode] = useState<WeekMode>("current");
  const [weekRows, setWeekRows] = useState<DayStatus[]>([]);
  const [isWeekLoading, setIsWeekLoading] = useState(true);
  const [weekError, setWeekError] = useState("");

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      router.push("/");
      return;
    }

    if (isRole(storedUser, "admin") || isRole(storedUser, "directeur")) {
      router.push(getDashboardPathByRole(storedUser.role));
      return;
    }

    if (!isRole(storedUser, "employe")) {
      router.push("/");
      return;
    }

    Promise.resolve().then(() => {
      setUser(storedUser);
      setIsAuthorized(true);
    });
  }, [router]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isActive = true;

    async function refreshWeekState() {
      setIsWeekLoading(true);
      setWeekError("");

      try {
        const days = await Promise.all(
          getWeekDates(weekMode).map((date) => fetchDayStatus(date))
        );

        if (isActive) {
          setWeekRows(days);
        }
      } catch (error) {
        if (isActive) {
          setWeekRows([]);
          setWeekError(
            error instanceof Error
              ? error.message
              : "Impossible de charger le planning."
          );
        }
      } finally {
        if (isActive) {
          setIsWeekLoading(false);
        }
      }
    }

    refreshWeekState();

    return () => {
      isActive = false;
    };
  }, [isAuthorized, weekMode]);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <EmployeeNavbar user={user} onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              Planning
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Consultation limitée à cette semaine et la semaine prochaine.
            </p>
          </div>

          <div className="flex w-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 sm:w-auto">
            {(["current", "next"] as WeekMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setWeekMode(mode)}
                className={`h-9 flex-1 px-4 text-sm font-semibold transition sm:flex-none ${
                  weekMode === mode
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {mode === "current" ? "Cette semaine" : "Semaine prochaine"}
              </button>
            ))}
          </div>
        </div>

        {isWeekLoading ? (
          <LoadingPanel label="Chargement du planning..." />
        ) : weekError ? (
          <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
            {weekError}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weekRows.map((day, index) => (
              <DayCard key={day.date} day={day} index={index} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
