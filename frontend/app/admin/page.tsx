"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AdminNavbar from "@/components/AdminNavbar";
import { API_BASE_URL, translateUserMessage } from "@/lib/api";

type NestedRecord = Record<string, unknown>;
type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe?: string | NestedRecord;
  periode?: string | NestedRecord;
  role_travail?: string | NestedRecord;
};
type DashboardOverviewPayload = {
  planning?: unknown;
  repos?: unknown;
  summary?: {
    groupe_matin?: unknown;
    groupe_soir?: unknown;
    employe_nuit?: unknown;
    nombre_repos?: unknown;
  };
};
type DashboardSummary = {
  groupe_matin: string;
  groupe_soir: string;
  employe_nuit: string;
  nombre_repos: number;
};

const shifts = ["Matin", "Soir", "Nuit"];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDate(dateValue: string, offset: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + offset);

  return formatDateValue(date);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getString(row: NestedRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getValueAsString(row: NestedRecord, keys: string[]) {
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

function getNested(row: ApiRow, key: string) {
  const value = row[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NestedRecord)
    : null;
}

function getEmployeeName(row: ApiRow) {
  const directName = getString(row, ["full_name", "employe_nom_complet"]);

  if (directName) {
    return directName;
  }

  if (typeof row.employe === "string" && row.employe.trim()) {
    return row.employe.trim();
  }

  const employe = getNested(row, "employe");

  if (employe) {
    const nestedDirectName = getString(employe, [
      "full_name",
      "employe_nom_complet",
      "nom_complet",
    ]);

    if (nestedDirectName) {
      return nestedDirectName;
    }

    const nestedName = [
      getString(employe, ["prenom", "employe_prenom"]),
      getString(employe, ["nom", "employe_nom"]),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (nestedName) {
      return nestedName;
    }
  }

  return [
    getString(row, ["prenom", "employe_prenom"]),
    getString(row, ["nom", "employe_nom"]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getShiftName(row: ApiRow) {
  const periode = getNested(row, "periode");

  return (
    getString(row, [
      "periode_travail",
      "periode_nom",
      "periode",
      "periode_name",
      "periodeTravail",
    ]) ||
    (periode ? getString(periode, ["nom", "name"]) : "") ||
    "Non défini"
  );
}

function getRoleName(row: ApiRow) {
  const roleTravail = getNested(row, "role_travail");

  return (
    getString(row, [
      "role_travail",
      "role_travail_nom",
      "role",
      "role_name",
      "roleTravail",
    ]) ||
    (roleTravail ? getString(roleTravail, ["nom", "name"]) : "") ||
    "Rôle non défini"
  );
}

function getGroupName(row: ApiRow) {
  const employe = getNested(row, "employe");

  return (
    getString(row, [
      "groupe",
      "groupe_nom",
      "groupe_name",
      "employe_groupe",
    ]) ||
    (employe ? getString(employe, ["groupe", "groupe_nom", "groupe_name"]) : "") ||
    "Groupe non défini"
  );
}

function getReposType(row: ApiRow) {
  return getString(row, ["type", "repos_type", "type_repos"]) || "Repos";
}

function getEmployeeMatchKey(row: ApiRow) {
  const idKeys = ["employe_id", "employee_id", "id_employe"];
  const directId = getValueAsString(row, idKeys);

  if (directId) {
    return `id:${directId}`;
  }

  const employe = getNested(row, "employe");
  const nestedId = employe ? getValueAsString(employe, ["id", ...idKeys]) : "";

  if (nestedId) {
    return `id:${nestedId}`;
  }

  const employeeName = normalizeText(getEmployeeName(row));

  return employeeName ? `name:${employeeName}` : "";
}

function hasReposForEmployee(rows: ApiRow[], row: ApiRow) {
  const employeeKey = getEmployeeMatchKey(row);

  return Boolean(
    employeeKey && rows.some((candidate) => getEmployeeMatchKey(candidate) === employeeKey)
  );
}

function getReposProgress(row: ApiRow, previousRows: ApiRow[], nextRows: ApiRow[]) {
  const isTwoDayRepos = normalizeText(getReposType(row)).includes("2");

  if (!isTwoDayRepos) {
    return {
      currentDay: 1,
      totalDays: 1,
      progress: 100,
    };
  }

  const isSecondDay = hasReposForEmployee(previousRows, row);

  return {
    currentDay: isSecondDay ? 2 : 1,
    totalDays: 2,
    progress: isSecondDay ? 100 : 50,
    isContinuous: isSecondDay || hasReposForEmployee(nextRows, row),
  };
}

function ReposProgressBar({
  currentDay,
  totalDays,
  progress,
}: {
  currentDay: number;
  totalDays: number;
  progress: number;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium">
        <span className="text-[var(--color-text-muted)]">
          Repos {currentDay}/{totalDays} jour{totalDays > 1 ? "s" : ""}
        </span>
        <span className="text-[var(--color-accent)]">{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[2px] bg-[var(--color-border)]">
        <div
          className="h-full rounded-[2px] bg-[var(--color-accent)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function groupRowsByShift(rows: ApiRow[]) {
  return shifts.reduce<Record<string, ApiRow[]>>((result, shift) => {
    result[shift] = rows.filter(
      (row) => normalizeText(getShiftName(row)) === normalizeText(shift)
    );

    return result;
  }, {});
}

async function fetchProtectedJson<T>(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(translateUserMessage(data?.message || "Erreur lors du chargement."));
  }

  return data as T;
}

async function fetchProtectedRows(url: string, token: string) {
  const data = await fetchProtectedJson<unknown>(url, token);

  return Array.isArray(data) ? (data as ApiRow[]) : [];
}

function getDashboardSummary(payload: DashboardOverviewPayload): DashboardSummary {
  const summary = payload.summary || {};
  const reposCount = Number(summary.nombre_repos);

  return {
    groupe_matin:
      typeof summary.groupe_matin === "string" && summary.groupe_matin.trim()
        ? summary.groupe_matin.trim()
        : "Aucun planning",
    groupe_soir:
      typeof summary.groupe_soir === "string" && summary.groupe_soir.trim()
        ? summary.groupe_soir.trim()
        : "Aucun planning",
    employe_nuit:
      typeof summary.employe_nuit === "string" && summary.employe_nuit.trim()
        ? summary.employe_nuit.trim()
        : "Aucun planning",
    nombre_repos: Number.isFinite(reposCount) ? reposCount : 0,
  };
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="border-b border-[var(--color-border)] p-4 sm:border-r lg:[&:nth-child(3)]:border-r-0 lg:[&:nth-last-child(-n+2)]:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  );
}

function PlanningSection({
  shift,
  rows,
}: {
  shift: string;
  rows: ApiRow[];
}) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-base font-semibold text-[var(--color-text)]">{shift}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">{rows.length} employé(s)</p>
      </div>

      <div className="space-y-3 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Aucun employé assigné.</p>
        ) : (
          rows.map((row, index) => (
            <article
              key={row.id || `${shift}-${index}`}
              className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
            >
              <h4 className="text-sm font-semibold text-[var(--color-text)]">
                {getEmployeeName(row) || "Employé non défini"}
              </h4>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{getRoleName(row)}</p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{getGroupName(row)}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => formatDateValue(new Date()));
  const [planningRows, setPlanningRows] = useState<ApiRow[]>([]);
  const [reposRows, setReposRows] = useState<ApiRow[]>([]);
  const [previousReposRows, setPreviousReposRows] = useState<ApiRow[]>([]);
  const [nextReposRows, setNextReposRows] = useState<ApiRow[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>({
    groupe_matin: "Aucun planning",
    groupe_soir: "Aucun planning",
    employe_nuit: "Aucun planning",
    nombre_repos: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isReposOpen, setIsReposOpen] = useState(false);
  const [error, setError] = useState("");

  const rowsByShift = useMemo(
    () => groupRowsByShift(planningRows),
    [planningRows]
  );

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
    router.push("/");
  }

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    const authToken = token;
    let isActive = true;

    async function fetchDayData() {
      setIsLoading(true);
      setError("");

      try {
        const previousDate = addDaysToDate(selectedDate, -1);
        const nextDate = addDaysToDate(selectedDate, 1);
        const [overview, previousRepos, nextRepos] = await Promise.all([
          fetchProtectedJson<DashboardOverviewPayload>(
            `${API_BASE_URL}/api/stats/overview?date=${encodeURIComponent(selectedDate)}`,
            authToken
          ),
          fetchProtectedRows(
            `${API_BASE_URL}/api/repos/date/${previousDate}`,
            authToken
          ).catch(() => []),
          fetchProtectedRows(
            `${API_BASE_URL}/api/repos/date/${nextDate}`,
            authToken
          ).catch(() => []),
        ]);

        if (!isActive) {
          return;
        }

        setPlanningRows(Array.isArray(overview.planning) ? overview.planning : []);
        setReposRows(Array.isArray(overview.repos) ? overview.repos : []);
        setPreviousReposRows(previousRepos);
        setNextReposRows(nextRepos);
        setDashboardSummary(getDashboardSummary(overview));
      } catch (fetchError) {
        if (isActive) {
          setPlanningRows([]);
          setReposRows([]);
          setPreviousReposRows([]);
          setNextReposRows([]);
          setDashboardSummary({
            groupe_matin: "Aucun planning",
            groupe_soir: "Aucun planning",
            employe_nuit: "Aucun planning",
            nombre_repos: 0,
          });
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Impossible de contacter le serveur backend."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    fetchDayData();

    return () => {
      isActive = false;
    };
  }, [router, selectedDate]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Tableau de bord Admin
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Planning et repos du jour sélectionné.
          </p>
        </div>

        <div className="mb-8">
          <section>
            <label className="mb-3 flex w-fit flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Date
              <span className="relative inline-flex">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) =>
                    setSelectedDate(event.target.value || formatDateValue(new Date()))
                  }
                  className="h-7 min-w-[136px] rounded-[3px] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 text-xs font-medium leading-none text-[var(--color-text)] outline-none transition hover:border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface-muted)] focus:ring-1 focus:ring-[var(--color-accent)]/25"
                />
              </span>
            </label>

            <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-base font-semibold text-[var(--color-text)]">
                  Vue d&apos;ensemble
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Situation opérationnelle du jour
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                <SummaryItem label="Date sélectionnée" value={selectedDate} />
                <SummaryItem label="Groupe Matin" value={dashboardSummary.groupe_matin} />
                <SummaryItem label="Groupe Soir" value={dashboardSummary.groupe_soir} />
                <SummaryItem label="Employé Nuit" value={dashboardSummary.employe_nuit} />
                <SummaryItem label="Nombre repos" value={dashboardSummary.nombre_repos} />
                <article className="border-b border-[var(--color-border)] p-4 sm:border-r lg:border-b-0 lg:border-r-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Repos
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsReposOpen((current) => !current)}
                    className="mt-2 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    {isReposOpen ? "Masquer repos du jour" : "Afficher repos du jour"}
                  </button>
                  {isReposOpen ? (
                    <div className="mt-4">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold text-[var(--color-text)]">
                            Repos du jour
                          </h2>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {reposRows.length} employé(s)
                          </p>
                        </div>
                        <span className="border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
                          {selectedDate}
                        </span>
                      </div>

                      {isLoading ? (
                        <p className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-4 text-sm text-[var(--color-text-muted)]">
                          Chargement...
                        </p>
                      ) : error ? (
                        <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-4 text-sm text-[var(--color-danger-text)]">
                          {error}
                        </p>
                      ) : reposRows.length === 0 ? (
                        <p className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-4 text-sm text-[var(--color-text-muted)]">
                          Aucun repos trouvé pour cette date.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {reposRows.map((row, index) => {
                            const progressInfo = getReposProgress(
                              row,
                              previousReposRows,
                              nextReposRows
                            );

                            return (
                              <article
                                key={row.id || `repos-${index}`}
                                className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                              >
                                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                                  {getEmployeeName(row) || "Employé non défini"}
                                </h3>
                                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                                  Type: {getReposType(row)}
                                </p>
                                <ReposProgressBar
                                  currentDay={progressInfo.currentDay}
                                  totalDays={progressInfo.totalDays}
                                  progress={progressInfo.progress}
                                />
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              </div>
            </div>
          </section>

        </div>

        {isLoading ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Chargement...
          </p>
        ) : error ? (
          <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
            {error}
          </p>
        ) : (
          <section id="planning">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[var(--color-text)]">
                Planning
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">{selectedDate}</p>
            </div>

            {planningRows.length === 0 ? (
              <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
                Aucun planning trouvé pour cette date.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {shifts.map((shift) => (
                  <PlanningSection
                    key={shift}
                    shift={shift}
                    rows={rowsByShift[shift]}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
