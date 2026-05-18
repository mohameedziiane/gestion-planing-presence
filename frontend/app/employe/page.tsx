"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmployeeNavbar from "@/components/EmployeeNavbar";
import { ApiError, apiFetch } from "@/lib/api";
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

type TodayState = {
  planning: ApiRow[];
  repos: ApiRow[];
  presence: ApiRow[];
};

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
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

function getEmployeeName(user: StoredUser | null) {
  const firstName = user?.employe?.prenom?.trim() || "";
  const lastName = user?.employe?.nom?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return fullName || user?.email || "Employé";
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

async function fetchTodayStatus(date: string): Promise<TodayState> {
  const [planning, repos, presence] = await Promise.all([
    apiFetch(`/api/planning/date/${date}`).then(getRows),
    apiFetch(`/api/repos/date/${date}`).then(getRows),
    apiFetch(`/api/presence/date/${date}`).then(getRows),
  ]);

  return {
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
  tone: "blue" | "green" | "red" | "muted";
}) {
  const classes = {
    blue: "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
    green: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    red: "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]",
    muted: "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
  };

  return (
    <span className={`inline-flex w-fit border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}

export default function EmployePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [todayState, setTodayState] = useState<TodayState>({
    planning: [],
    repos: [],
    presence: [],
  });
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isPointing, setIsPointing] = useState(false);
  const [todayError, setTodayError] = useState("");
  const [pointageMessage, setPointageMessage] = useState("");

  const todayDate = useMemo(() => getTodayDateValue(), []);
  const todayReposRow = todayState.repos[0];
  const todayPresenceRow = todayState.presence[0];
  const todayPresenceStatus = normalizeText(getPresenceStatus(todayPresenceRow));
  const alreadyPointed = todayPresenceStatus === normalizeText("Présent");
  const hasTodayPlanning = todayState.planning.length > 0;
  const hasTodayRepos = todayState.repos.length > 0;
  const canPoint =
    isAuthorized &&
    !isTodayLoading &&
    !isPointing &&
    hasTodayPlanning &&
    !hasTodayRepos &&
    !alreadyPointed;

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

  const refreshTodayState = useCallback(async () => {
    setIsTodayLoading(true);
    setTodayError("");

    try {
      const dayStatus = await fetchTodayStatus(todayDate);

      setTodayState({
        planning: dayStatus.planning,
        repos: dayStatus.repos,
        presence: dayStatus.presence,
      });
    } catch (error) {
      setTodayState({ planning: [], repos: [], presence: [] });
      setTodayError(
        error instanceof Error
          ? error.message
          : "Impossible de charger le pointage du jour."
      );
    } finally {
      setIsTodayLoading(false);
    }
  }, [todayDate]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    Promise.resolve().then(() => {
      void refreshTodayState();
    });
  }, [isAuthorized, refreshTodayState]);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  async function handlePointage() {
    setIsPointing(true);
    setPointageMessage("");

    try {
      const result = await apiFetch<{ message?: string }>("/api/presence/pointer", {
        method: "POST",
      });

      setPointageMessage(result.message || "Présence pointée avec succès.");
      await refreshTodayState();
    } catch (error) {
      setPointageMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de pointer la présence."
      );
    } finally {
      setIsPointing(false);
    }
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
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              Pointage
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Pointage du jour et statut de présence.
            </p>
          </div>
          <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Employé connecté
            </p>
            <p className="mt-1 text-base font-semibold text-[var(--color-text)]">
              {getEmployeeName(user)}
            </p>
          </div>
        </div>

        <section className="border border-l-4 border-[var(--color-border)] border-l-[var(--color-accent)] bg-[var(--color-surface)] p-4 sm:p-5">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-text)]">
                Pointage du jour
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {getEmployeeName(user)} - {todayDate}
              </p>
            </div>
            {alreadyPointed ? (
              <StatusBadge tone="green">Déjà pointé</StatusBadge>
            ) : hasTodayRepos ? (
              <StatusBadge tone="muted">Repos</StatusBadge>
            ) : hasTodayPlanning ? (
              <StatusBadge tone="blue">Travail</StatusBadge>
            ) : (
              <StatusBadge tone="red">No planning</StatusBadge>
            )}
          </div>

          {isTodayLoading ? (
            <p className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-4 text-sm text-[var(--color-text-muted)]">
              Chargement du pointage...
            </p>
          ) : todayError ? (
            <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-4 text-sm text-[var(--color-danger-text)]">
              {todayError}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                {alreadyPointed ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      Présence déjà enregistrée
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      Heure d&apos;arrivée: {getArrivalTime(todayPresenceRow)}
                    </p>
                  </>
                ) : hasTodayRepos ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      Repos aujourd&apos;hui
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      Type: {getReposType(todayReposRow)}
                    </p>
                  </>
                ) : hasTodayPlanning ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      Travail aujourd&apos;hui
                    </p>
                    {todayState.planning.map((row, index) => (
                      <div
                        key={row.id || `today-${index}`}
                        className="border-l-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {getShiftName(row)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                          {getRoleName(row)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      Aucun planning aujourd&apos;hui
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      Le pointage est indisponible sans planning du jour.
                    </p>
                  </>
                )}
              </div>

              <aside className="flex flex-col justify-between gap-4 border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Action
                  </p>
                </div>

                {canPoint ? (
                  <button
                    type="button"
                    onClick={handlePointage}
                    disabled={isPointing}
                    className="h-11 bg-[var(--color-accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 disabled:cursor-not-allowed disabled:bg-[var(--color-accent-hover)] disabled:opacity-70"
                  >
                    {isPointing ? "Pointage..." : "Pointer ma présence"}
                  </button>
                ) : (
                  <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-text-muted)]">
                    {alreadyPointed
                      ? "Vous avez déjà pointé aujourd'hui."
                      : hasTodayRepos
                        ? "Pointage indisponible pendant un repos."
                        : hasTodayPlanning
                          ? "Pointage momentanément indisponible."
                          : "Pointage indisponible sans planning."}
                  </p>
                )}

                {pointageMessage ? (
                  <p className="border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-3 py-3 text-sm font-semibold text-[var(--color-accent)]">
                    {pointageMessage}
                  </p>
                ) : null}
              </aside>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
