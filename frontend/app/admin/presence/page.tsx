"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
} from "@/lib/auth";
import AdminNavbar from "@/components/AdminNavbar";

type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe_id?: number | string;
};

type PresenceEdit = {
  statut: string;
  heure_arrivee: string;
};

type PresenceRow = {
  key: string;
  employeId: number | null;
  name: string;
  group: string;
  planning: ApiRow[];
  repos: ApiRow | null;
  presence: ApiRow | null;
};

type SyncSummary = {
  date: string;
  insertedCount: number;
  skippedAlreadyHasPresence: number;
  skippedRepos: number;
  totalPlanningEmployees: number;
};

const STATUS_PRESENT = "Présent";
const STATUS_ABSENT = "Absent";
const EMPTY_STATUS = "Non enregistré";

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

function getCurrentTimeValue() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
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

function getEmployeeId(row: ApiRow | null | undefined) {
  const value = row?.employe_id;
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function getEmployeeName(row: ApiRow | null | undefined) {
  const name = [getString(row, ["prenom"]), getString(row, ["nom"])]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    getString(row, ["full_name", "employe_nom_complet"]) ||
    name ||
    "Employé non défini"
  );
}

function getGroupName(row: ApiRow | null | undefined) {
  return getString(row, ["groupe", "groupe_nom", "groupe_name"]) || "-";
}

function getShiftName(row: ApiRow) {
  return getString(row, ["periode_travail", "periode_nom", "periode"]) || "-";
}

function getRoleName(row: ApiRow) {
  return getString(row, ["role_travail", "role_travail_nom", "role"]) || "-";
}

function getPresenceStatus(row: ApiRow | null | undefined) {
  return getString(row, ["statut", "status"]);
}

function getArrivalTime(row: ApiRow | null | undefined) {
  return getString(row, ["heure_arrivee"]);
}

function getRows(payload: unknown) {
  return Array.isArray(payload) ? (payload as ApiRow[]) : [];
}

function groupRowsByEmployee(rows: ApiRow[]) {
  return rows.reduce<Map<number, ApiRow[]>>((result, row) => {
    const employeId = getEmployeeId(row);

    if (!employeId) {
      return result;
    }

    const existingRows = result.get(employeId) || [];
    existingRows.push(row);
    result.set(employeId, existingRows);

    return result;
  }, new Map());
}

function mapSingleRowByEmployee(rows: ApiRow[]) {
  return rows.reduce<Map<number, ApiRow>>((result, row) => {
    const employeId = getEmployeeId(row);

    if (employeId && !result.has(employeId)) {
      result.set(employeId, row);
    }

    return result;
  }, new Map());
}

function mergeRows(planning: ApiRow[], repos: ApiRow[], presence: ApiRow[]) {
  const planningByEmployee = groupRowsByEmployee(planning);
  const reposByEmployee = mapSingleRowByEmployee(repos);
  const presenceByEmployee = mapSingleRowByEmployee(presence);
  const employeeIds = new Set<number>();

  planningByEmployee.forEach((_, employeId) => employeeIds.add(employeId));
  reposByEmployee.forEach((_, employeId) => employeeIds.add(employeId));
  presenceByEmployee.forEach((_, employeId) => employeeIds.add(employeId));

  return Array.from(employeeIds)
    .sort((leftId, rightId) => leftId - rightId)
    .map((employeId) => {
      const employeePlanning = planningByEmployee.get(employeId) || [];
      const reposRow = reposByEmployee.get(employeId) || null;
      const presenceRow = presenceByEmployee.get(employeId) || null;
      const sourceRow = employeePlanning[0] || reposRow || presenceRow;

      return {
        key: String(employeId),
        employeId,
        name: getEmployeeName(sourceRow),
        group: getGroupName(sourceRow),
        planning: employeePlanning,
        repos: reposRow,
        presence: presenceRow,
      };
    });
}

function buildInitialEdits(rows: PresenceRow[]) {
  return rows.reduce<Record<string, PresenceEdit>>((result, row) => {
    result[row.key] = {
      statut: getPresenceStatus(row.presence) || STATUS_PRESENT,
      heure_arrivee: getArrivalTime(row.presence),
    };

    return result;
  }, {});
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === STATUS_PRESENT
      ? "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]"
      : status === STATUS_ABSENT
        ? "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
        : status === "Repos"
          ? "border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] text-[var(--color-badge-text)]"
          : "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]";

  return (
    <span className={`inline-flex w-fit border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

export default function AdminPresencePage() {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue);
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [edits, setEdits] = useState<Record<string, PresenceEdit>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeRowKey, setActiveRowKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const hasRows = rows.length > 0;

  const summary = useMemo(() => {
    return rows.reduce(
      (result, row) => {
        if (row.repos) {
          result.repos += 1;
        } else if (!row.presence) {
          result.unregistered += 1;
        } else if (getPresenceStatus(row.presence) === STATUS_PRESENT) {
          result.present += 1;
        } else if (getPresenceStatus(row.presence) === STATUS_ABSENT) {
          result.absent += 1;
        }

        return result;
      },
      { present: 0, absent: 0, unregistered: 0, repos: 0 }
    );
  }, [rows]);

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (!token || !user) {
      router.push("/");
      return;
    }

    if (isRole(user, "employe") || isRole(user, "directeur")) {
      router.push(getDashboardPathByRole(user.role));
      return;
    }

    if (!isRole(user, "admin")) {
      router.push("/");
      return;
    }

    Promise.resolve().then(() => setIsAllowed(true));
  }, [router]);

  const loadPresence = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const [planningPayload, reposPayload, presencePayload] = await Promise.all([
        apiFetch(`/api/planning/date/${selectedDate}`),
        apiFetch(`/api/repos/date/${selectedDate}`),
        apiFetch(`/api/presence/date/${selectedDate}`),
      ]);
      const mergedRows = mergeRows(
        getRows(planningPayload),
        getRows(reposPayload),
        getRows(presencePayload)
      );

      setRows(mergedRows);
      setEdits(buildInitialEdits(mergedRows));
    } catch (error) {
      setRows([]);
      setEdits({});
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger la présence."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAllowed, selectedDate]);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    Promise.resolve().then(() => {
      void loadPresence();
    });
  }, [isAllowed, loadPresence]);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  function updateEdit(rowKey: string, patch: Partial<PresenceEdit>) {
    setEdits((currentEdits) => ({
      ...currentEdits,
      [rowKey]: {
        statut: currentEdits[rowKey]?.statut || STATUS_PRESENT,
        heure_arrivee: currentEdits[rowKey]?.heure_arrivee || "",
        ...patch,
      },
    }));
  }

  async function saveExistingPresence(row: PresenceRow) {
    if (!row.presence?.id || !row.employeId) {
      return;
    }

    const edit = edits[row.key] || {
      statut: getPresenceStatus(row.presence) || STATUS_PRESENT,
      heure_arrivee: getArrivalTime(row.presence),
    };

    setActiveRowKey(row.key);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch(`/api/presence/${row.presence.id}`, {
        method: "PUT",
        body: JSON.stringify({
          employe_id: row.employeId,
          _date: selectedDate,
          statut: edit.statut,
          heure_arrivee: edit.heure_arrivee || null,
          adresse_ip: getString(row.presence, ["adresse_ip"]) || null,
        }),
      });
      setSuccessMessage("Présence mise à jour.");
      await loadPresence();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour la présence."
      );
    } finally {
      setActiveRowKey("");
    }
  }

  async function createPresence(row: PresenceRow, statut: string) {
    if (!row.employeId || row.repos) {
      return;
    }

    setActiveRowKey(row.key);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch("/api/presence", {
        method: "POST",
        body: JSON.stringify({
          employe_id: row.employeId,
          _date: selectedDate,
          statut,
          heure_arrivee: statut === STATUS_PRESENT ? getCurrentTimeValue() : null,
          adresse_ip: null,
        }),
      });
      setSuccessMessage(
        statut === STATUS_PRESENT
          ? "Employé marqué présent."
          : "Employé marqué absent."
      );
      await loadPresence();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de créer la présence."
      );
    } finally {
      setActiveRowKey("");
    }
  }

  async function syncAbsences() {
    setIsSyncing(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await apiFetch<SyncSummary>("/api/presence/sync-absences", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate }),
      });

      setSuccessMessage(
        `${result.insertedCount} absence(s) synchronisée(s). ` +
          `${result.skippedAlreadyHasPresence} déjà enregistrée(s), ` +
          `${result.skippedRepos} repos, ${result.totalPlanningEmployees} employé(s) planifié(s).`
      );
      await loadPresence();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de synchroniser les absences."
      );
    } finally {
      setIsSyncing(false);
    }
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
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Correction des présences
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Synchroniser les absences et corriger les pointages manuellement.
          </p>
        </div>

        <section className="mb-6 border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
              />
              <span className="text-xs font-normal text-[var(--color-text-muted)]">
                Les données se chargent automatiquement après le choix de la date.
              </span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={loadPresence}
                disabled={isLoading}
                className="h-10 border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Chargement..." : "Actualiser"}
              </button>
              <button
                type="button"
                onClick={syncAbsences}
                disabled={isSyncing || isLoading}
                className="h-10 bg-[var(--color-accent)] px-4 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSyncing ? "Synchronisation..." : "Synchroniser les absences"}
              </button>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <p className="mb-5 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mb-5 border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success-text)]">
            {successMessage}
          </p>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Présents
            </p>
            <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">
              {summary.present}
            </p>
          </article>
          <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Absents
            </p>
            <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">
              {summary.absent}
            </p>
          </article>
          <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Non enregistrés
            </p>
            <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">
              {summary.unregistered}
            </p>
          </article>
          <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Repos
            </p>
            <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">
              {summary.repos}
            </p>
          </article>
        </div>

        {isLoading ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Chargement des présences...
          </p>
        ) : !hasRows ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Aucun planning, repos ou pointage trouvé pour cette date.
          </p>
        ) : (
          <section className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead className="bg-[var(--color-surface-muted)] text-left">
                <tr>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Employé
                  </th>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Planning
                  </th>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Statut
                  </th>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Heure arrivée
                  </th>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Adresse IP
                  </th>
                  <th className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = row.repos
                    ? "Repos"
                    : getPresenceStatus(row.presence) || EMPTY_STATUS;
                  const edit = edits[row.key] || {
                    statut: getPresenceStatus(row.presence) || STATUS_PRESENT,
                    heure_arrivee: getArrivalTime(row.presence),
                  };
                  const isRowBusy = activeRowKey === row.key;

                  return (
                    <tr key={row.key} className="align-top">
                      <td className="border border-[var(--color-border)] px-4 py-3">
                        <p className="font-semibold text-[var(--color-text)]">{row.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{row.group}</p>
                      </td>
                      <td className="border border-[var(--color-border)] px-4 py-3">
                        {row.repos ? (
                          <p className="font-semibold text-[var(--color-text-muted)]">Repos</p>
                        ) : row.planning.length > 0 ? (
                          <div className="space-y-2">
                            {row.planning.map((planningRow, index) => (
                              <p key={planningRow.id || `${row.key}-${index}`}>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {getShiftName(planningRow)}
                                </span>
                                <span className="text-[var(--color-text-muted)]">
                                  {" "}
                                  - {getRoleName(planningRow)}
                                </span>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[var(--color-text-muted)]">Aucun planning</p>
                        )}
                      </td>
                      <td className="border border-[var(--color-border)] px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="border border-[var(--color-border)] px-4 py-3">
                        {row.presence ? (
                          <input
                            type="time"
                            step="1"
                            value={edit.heure_arrivee || ""}
                            onChange={(event) =>
                              updateEdit(row.key, {
                                heure_arrivee: event.target.value,
                              })
                            }
                            className="h-9 w-32 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                          />
                        ) : (
                          <span className="text-[var(--color-text-muted)]">-</span>
                        )}
                      </td>
                      <td className="border border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">
                        {getString(row.presence, ["adresse_ip"]) || "-"}
                      </td>
                      <td className="border border-[var(--color-border)] px-4 py-3">
                        {row.presence ? (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={edit.statut}
                              onChange={(event) =>
                                updateEdit(row.key, {
                                  statut: event.target.value,
                                })
                              }
                              className="h-9 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                            >
                              <option value={STATUS_PRESENT}>Présent</option>
                              <option value={STATUS_ABSENT}>Absent</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => saveExistingPresence(row)}
                              disabled={isRowBusy}
                              className="h-9 bg-[var(--color-accent)] px-3 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isRowBusy ? "..." : "Enregistrer"}
                            </button>
                          </div>
                        ) : row.repos ? (
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Aucune action pendant repos
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => createPresence(row, STATUS_PRESENT)}
                              disabled={isRowBusy}
                              className="h-9 border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 text-sm font-semibold text-[var(--color-success-text)] transition hover:border-[var(--color-badge-success-border)] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Marquer présent
                            </button>
                            <button
                              type="button"
                              onClick={() => createPresence(row, STATUS_ABSENT)}
                              disabled={isRowBusy}
                              className="h-9 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 text-sm font-semibold text-[var(--color-danger-text)] transition hover:border-[var(--color-danger-text)] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Marquer absent
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </main>
  );
}
