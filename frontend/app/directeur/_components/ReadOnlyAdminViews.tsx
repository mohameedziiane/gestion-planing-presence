"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import DirecteurNavbar from "@/components/DirecteurNavbar";
import { apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
} from "@/lib/auth";

type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe_id?: number | string;
  prenom?: string | null;
  nom?: string | null;
  full_name?: string | null;
  groupe?: string | null;
  statut?: string | null;
  type?: string | null;
  periode_travail?: string | null;
  role_travail?: string | null;
  heure_arrivee?: string | null;
};

type CongeResponse = {
  demandes?: ApiRow[];
};

type MedicalDeductionsResponse = {
  deductions?: ApiRow[];
};

type FilterValue = "Tous" | "En attente" | "Accepté" | "Refusé";

const FILTERS: FilterValue[] = ["Tous", "En attente", "Accepté", "Refusé"];
const STATUS_PRESENT = "Présent";
const STATUS_ABSENT = "Absent";
const STATUS_NOT_POINTED = "Non pointé";

function getDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return getDateInputValue(new Date());
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
  }

  return "";
}

function getEmployeeName(row: ApiRow) {
  return (
    getString(row, ["full_name", "nom_complet", "employe_nom_complet"]) ||
    [getString(row, ["prenom", "employe_prenom"]), getString(row, ["nom", "employe_nom"])]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Employé non défini"
  );
}

function getEmployeeKey(row: ApiRow) {
  if (row.employe_id !== undefined && row.employe_id !== null) {
    return String(row.employe_id);
  }

  if (row.id !== undefined && row.id !== null) {
    return String(row.id);
  }

  return getEmployeeName(row).toLowerCase();
}

function getGroupName(row: ApiRow) {
  return getString(row, ["groupe", "groupe_nom", "groupe_name"]) || "Groupe non défini";
}

function getStatusClass(status: string) {
  if (status === STATUS_PRESENT || status === "Accepté" || status === "Actif") {
    return "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]";
  }

  if (status === STATUS_ABSENT || status === "Refusé" || status === "Inactif") {
    return "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]";
  }

  return "border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)]";
}

function ReadOnlyBadge() {
  return (
    <span className="w-fit border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-badge-text)]">
      Lecture seule
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
      {message}
    </p>
  );
}

function useDirecteurAccess() {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (!token || !user) {
      router.push("/");
      return;
    }

    if (!isRole(user, "directeur")) {
      router.push(getDashboardPathByRole(user.role));
      return;
    }

    setIsAllowed(true);
  }, [router]);

  return { isAllowed, router };
}

function PageShell({
  title,
  subtitle,
  children,
  isAllowed,
  router,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  isAllowed: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  if (!isAllowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <DirecteurNavbar onLogout={handleLogout} />
      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
          </div>
          <ReadOnlyBadge />
        </div>
        {children}
      </section>
    </main>
  );
}

export function DirecteurEmployeesPage() {
  const { isAllowed, router } = useDirecteurAccess();
  const [employees, setEmployees] = useState<ApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    let isActive = true;

    async function loadEmployees() {
      setIsLoading(true);
      setError("");

      try {
        const payload = await apiFetch<unknown>("/api/employes");
        if (isActive) {
          setEmployees(Array.isArray(payload) ? (payload as ApiRow[]) : []);
        }
      } catch (loadError) {
        if (isActive) {
          setEmployees([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de charger les employés."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadEmployees();

    return () => {
      isActive = false;
    };
  }, [isAllowed]);

  const activeCount = employees.filter((row) => row.actif !== false).length;

  return (
    <PageShell
      title="Employés"
      subtitle="Consultation des fiches employés, sans ajout ni modification."
      isAllowed={isAllowed}
      router={router}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Employés" value={employees.length} />
        <SummaryCard label="Actifs" value={activeCount} />
      </div>

      {isLoading ? (
        <EmptyState message="Chargement des employés..." />
      ) : error ? (
        <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
          {error}
        </p>
      ) : employees.length === 0 ? (
        <EmptyState message="Aucun employé trouvé." />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee, index) => {
            const active = employee.actif !== false;

            return (
              <article
                key={employee.id || `employee-${index}`}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[var(--color-text)]">
                      {getEmployeeName(employee)}
                    </h2>
                    <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">
                      {getString(employee, ["email"]) || "Email non défini"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 border px-2 py-1 text-xs font-semibold ${getStatusClass(
                      active ? "Actif" : "Inactif"
                    )}`}
                  >
                    {active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[var(--color-text)]">
                  <span className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5">
                    {getGroupName(employee)}
                  </span>
                  <span className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5">
                    Sexe: {getString(employee, ["sexe"]) || "-"}
                  </span>
                  <span className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5">
                    Nuit: {employee.travail_nuit_autorise ? "Oui" : "Non"}
                  </span>
                  {getString(employee, ["controle_periode", "controle"]) ? (
                    <span className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5">
                      Contrôle: {getString(employee, ["controle_periode", "controle"])}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}

export function DirecteurPresencePage() {
  const { isAllowed, router } = useDirecteurAccess();
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue);
  const [planningRows, setPlanningRows] = useState<ApiRow[]>([]);
  const [reposRows, setReposRows] = useState<ApiRow[]>([]);
  const [presenceRows, setPresenceRows] = useState<ApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    let isActive = true;

    async function loadPresence() {
      setIsLoading(true);
      setError("");

      try {
        const [planningPayload, reposPayload, presencePayload] = await Promise.all([
          apiFetch<unknown>(`/api/planning/date/${selectedDate}`),
          apiFetch<unknown>(`/api/repos/date/${selectedDate}`),
          apiFetch<unknown>(`/api/presence/date/${selectedDate}`),
        ]);

        if (!isActive) {
          return;
        }

        setPlanningRows(Array.isArray(planningPayload) ? (planningPayload as ApiRow[]) : []);
        setReposRows(Array.isArray(reposPayload) ? (reposPayload as ApiRow[]) : []);
        setPresenceRows(Array.isArray(presencePayload) ? (presencePayload as ApiRow[]) : []);
      } catch (loadError) {
        if (isActive) {
          setPlanningRows([]);
          setReposRows([]);
          setPresenceRows([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de charger les présences."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPresence();

    return () => {
      isActive = false;
    };
  }, [isAllowed, selectedDate]);

  const mergedRows = useMemo(() => {
    const rows = new Map<string, { employee: ApiRow; planning: ApiRow[]; repos?: ApiRow; presence?: ApiRow }>();

    planningRows.forEach((row) => {
      const key = getEmployeeKey(row);
      const current = rows.get(key) || { employee: row, planning: [] };
      current.planning.push(row);
      rows.set(key, current);
    });

    reposRows.forEach((row) => {
      const key = getEmployeeKey(row);
      rows.set(key, { ...(rows.get(key) || { employee: row, planning: [] }), repos: row });
    });

    presenceRows.forEach((row) => {
      const key = getEmployeeKey(row);
      rows.set(key, { ...(rows.get(key) || { employee: row, planning: [] }), presence: row });
    });

    return Array.from(rows.values()).sort((left, right) =>
      getEmployeeName(left.employee).localeCompare(getEmployeeName(right.employee), "fr")
    );
  }, [planningRows, presenceRows, reposRows]);

  const presents = presenceRows.filter((row) => row.statut === STATUS_PRESENT).length;
  const absents = presenceRows.filter((row) => row.statut === STATUS_ABSENT).length;
  const notPointed = mergedRows.filter(
    (row) => row.planning.length > 0 && !row.repos && !row.presence
  ).length;

  return (
    <PageShell
      title="Présence"
      subtitle="Consultation des pointages, absences et statuts du jour sélectionné."
      isAllowed={isAllowed}
      router={router}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-10 min-w-44 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          />
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Planifiés" value={planningRows.length} />
        <SummaryCard label="Présents" value={presents} />
        <SummaryCard label="Absents" value={absents} />
        <SummaryCard label="Non pointés" value={notPointed} />
        <SummaryCard label="Repos" value={reposRows.length} />
      </div>

      {isLoading ? (
        <EmptyState message="Chargement des présences..." />
      ) : error ? (
        <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
          {error}
        </p>
      ) : mergedRows.length === 0 ? (
        <EmptyState message="Aucun planning, repos ou pointage trouvé pour cette date." />
      ) : (
        <section className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Employé</th>
                  <th className="px-4 py-3">Planning</th>
                  <th className="px-4 py-3">Présence</th>
                  <th className="px-4 py-3">Heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {mergedRows.map((row, index) => {
                  const status = row.repos
                    ? "Repos"
                    : row.presence?.statut?.toString() || STATUS_NOT_POINTED;

                  return (
                    <tr key={`${getEmployeeKey(row.employee)}-${index}`}>
                      <td className="px-4 py-3 font-semibold text-[var(--color-text)]">
                        {getEmployeeName(row.employee)}
                        <p className="mt-1 text-xs font-normal text-[var(--color-text-muted)]">
                          {getGroupName(row.employee)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">
                        {row.repos
                          ? "Repos"
                          : row.planning.length > 0
                            ? row.planning
                                .map(
                                  (item) =>
                                    `${getString(item, ["periode_travail"]) || "Période"} - ${
                                      getString(item, ["role_travail"]) || "Rôle"
                                    }`
                                )
                                .join(", ")
                            : "Aucun planning"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">
                        {row.presence?.heure_arrivee?.toString() || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PageShell>
  );
}

export function DirecteurReposPage() {
  const { isAllowed, router } = useDirecteurAccess();
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue);
  const [reposRows, setReposRows] = useState<ApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    let isActive = true;

    async function loadRepos() {
      setIsLoading(true);
      setError("");

      try {
        const payload = await apiFetch<unknown>(`/api/repos/date/${selectedDate}`);

        if (isActive) {
          setReposRows(Array.isArray(payload) ? (payload as ApiRow[]) : []);
        }
      } catch (loadError) {
        if (isActive) {
          setReposRows([]);
          setError(
            loadError instanceof Error ? loadError.message : "Impossible de charger les repos."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadRepos();

    return () => {
      isActive = false;
    };
  }, [isAllowed, selectedDate]);

  return (
    <PageShell
      title="Repos"
      subtitle="Consultation des repos par date, sans modification."
      isAllowed={isAllowed}
      router={router}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-10 min-w-44 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          />
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Date sélectionnée" value={selectedDate} />
        <SummaryCard label="Nombre repos" value={reposRows.length} />
      </div>

      {isLoading ? (
        <EmptyState message="Chargement des repos..." />
      ) : error ? (
        <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
          {error}
        </p>
      ) : reposRows.length === 0 ? (
        <EmptyState message="Aucun repos trouvé pour cette date." />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reposRows.map((row, index) => (
            <article
              key={row.id || `repos-${index}`}
              className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text)]">
                    {getEmployeeName(row)}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {getGroupName(row)}
                  </p>
                </div>
                <span className="border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
                  {getString(row, ["type", "repos_type"]) || "Repos"}
                </span>
              </div>
            </article>
          ))}
        </section>
      )}
    </PageShell>
  );
}

export function DirecteurCongesPage() {
  const { isAllowed, router } = useDirecteurAccess();
  const [filter, setFilter] = useState<FilterValue>("Tous");
  const [demandes, setDemandes] = useState<ApiRow[]>([]);
  const [deductions, setDeductions] = useState<ApiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadConges = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const [demandesPayload, deductionsPayload] = await Promise.all([
        apiFetch<CongeResponse>("/api/conges/admin/demandes"),
        apiFetch<MedicalDeductionsResponse>("/api/conges/admin/medical-deductions"),
      ]);

      setDemandes(Array.isArray(demandesPayload.demandes) ? demandesPayload.demandes : []);
      setDeductions(
        Array.isArray(deductionsPayload.deductions) ? deductionsPayload.deductions : []
      );
    } catch (loadError) {
      setDemandes([]);
      setDeductions([]);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les congés.");
    } finally {
      setIsLoading(false);
    }
  }, [isAllowed]);

  useEffect(() => {
    void loadConges();
  }, [loadConges]);

  const visibleDemandes = useMemo(() => {
    return demandes.filter((demande) => {
      const status = getString(demande, ["statut"]);
      return filter === "Tous" || status === filter;
    });
  }, [demandes, filter]);

  return (
    <PageShell
      title="Congés"
      subtitle="Consultation des demandes et déductions médicales, sans validation ni refus."
      isAllowed={isAllowed}
      router={router}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
          Statut
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterValue)}
            className="h-10 min-w-44 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
          >
            {FILTERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Demandes" value={demandes.length} />
        <SummaryCard
          label="En attente"
          value={demandes.filter((row) => getString(row, ["statut"]) === "En attente").length}
        />
        <SummaryCard
          label="Acceptés"
          value={demandes.filter((row) => getString(row, ["statut"]) === "Accepté").length}
        />
        <SummaryCard label="Déductions médicales" value={deductions.length} />
      </div>

      {isLoading ? (
        <EmptyState message="Chargement des congés..." />
      ) : error ? (
        <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
          {error}
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                Demandes de congé
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {visibleDemandes.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Aucune demande trouvée.
                </p>
              ) : (
                visibleDemandes.map((demande, index) => {
                  const status = getString(demande, ["statut"]) || "Statut inconnu";

                  return (
                    <article
                      key={demande.id || `demande-${index}`}
                      className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--color-text)]">
                            {getEmployeeName(demande)}
                          </h3>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {getGroupName(demande)}
                          </p>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                            {getString(demande, ["date_debut"])} -{" "}
                            {getString(demande, ["date_fin"])}
                          </p>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {getString(demande, ["type_conge"]) || "Congé"} -{" "}
                            {String(demande.nombre_jours || 0)} jour(s)
                          </p>
                        </div>
                        <span
                          className={`w-fit border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                Déductions médicales
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {deductions.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Aucune déduction médicale.
                </p>
              ) : (
                deductions.map((deduction, index) => (
                  <article
                    key={deduction.id || `deduction-${index}`}
                    className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                  >
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">
                      {getEmployeeName(deduction)}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {getGroupName(deduction)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {getString(deduction, ["date_debut_absence"])} -{" "}
                      {getString(deduction, ["date_fin_absence"])}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Jours déduits: {String(deduction.jours_deduits_conge || 0)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
