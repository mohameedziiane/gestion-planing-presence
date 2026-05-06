"use client";

import Image from "next/image";
import Link from "next/link";
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

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const EMPTY_STATUS = "Non enregistr\u00e9";

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
    "Employ\u00e9 non d\u00e9fini"
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
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : status === STATUS_ABSENT
        ? "border-red-300/25 bg-red-400/10 text-red-100"
        : status === "Repos"
          ? "border-[rgba(172,189,197,0.15)] bg-[#334149] text-[#acbdc5]"
          : "border-yellow-300/25 bg-yellow-400/10 text-yellow-100";

  return (
    <span className={`inline-flex w-fit border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function AdminNav({ onLogout }: { onLogout: () => void }) {
  const navItems = [
    { href: "/admin", label: "Accueil" },
    { href: "/admin/planning", label: "Planning" },
    { href: "/admin/employes", label: "Employ\u00e9s" },
    { href: "/admin/repos", label: "Repos" },
    { href: "/admin/presence", label: "Pr\u00e9sence" },
  ];

  return (
    <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
      <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-3">
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

          <div className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-3 py-2 text-sm font-semibold transition hover:text-[#e1e3e4] ${
                  item.href === "/admin/presence"
                    ? "border-[#1AB6FF] text-[#e1e3e4]"
                    : "border-transparent text-[#acbdc5]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
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
          : "Impossible de charger la pr\u00e9sence."
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
      setSuccessMessage("Pr\u00e9sence mise \u00e0 jour.");
      await loadPresence();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de mettre \u00e0 jour la pr\u00e9sence."
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
          ? "Employ\u00e9 marqu\u00e9 pr\u00e9sent."
          : "Employ\u00e9 marqu\u00e9 absent."
      );
      await loadPresence();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de cr\u00e9er la pr\u00e9sence."
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
        `${result.insertedCount} absence(s) synchronis\u00e9e(s). ` +
          `${result.skippedAlreadyHasPresence} d\u00e9j\u00e0 enregistr\u00e9e(s), ` +
          `${result.skippedRepos} repos, ${result.totalPlanningEmployees} employ\u00e9(s) planifi\u00e9(s).`
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
      <main className="flex min-h-screen items-center justify-center bg-[#4c595f] px-6 text-[#e1e3e4]">
        <p className="text-sm font-semibold text-[#acbdc5]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#4c595f] text-[#e1e3e4]">
      <AdminNav onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Correction des pr\u00e9sences
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Synchroniser les absences et corriger les pointages manuellement.
          </p>
        </div>

        <section className="mb-6 border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-sm font-semibold text-[#e1e3e4] outline-none transition focus:border-[#1AB6FF]"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={loadPresence}
                disabled={isLoading}
                className="h-10 border border-[rgba(172,189,197,0.18)] px-4 text-sm font-semibold text-[#e1e3e4] transition hover:border-[#1AB6FF] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Chargement..." : "Charger pr\u00e9sence"}
              </button>
              <button
                type="button"
                onClick={syncAbsences}
                disabled={isSyncing || isLoading}
                className="h-10 bg-[#1AB6FF] px-4 text-sm font-bold text-white transition hover:bg-[#169CDC] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSyncing ? "Synchronisation..." : "Synchroniser les absences"}
              </button>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <p className="mb-5 border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mb-5 border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
              Pr\u00e9sents
            </p>
            <p className="mt-2 text-xl font-semibold text-[#e1e3e4]">
              {summary.present}
            </p>
          </article>
          <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
              Absents
            </p>
            <p className="mt-2 text-xl font-semibold text-[#e1e3e4]">
              {summary.absent}
            </p>
          </article>
          <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
              Non enregistr\u00e9s
            </p>
            <p className="mt-2 text-xl font-semibold text-[#e1e3e4]">
              {summary.unregistered}
            </p>
          </article>
          <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
              Repos
            </p>
            <p className="mt-2 text-xl font-semibold text-[#e1e3e4]">
              {summary.repos}
            </p>
          </article>
        </div>

        {isLoading ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Chargement des pr\u00e9sences...
          </p>
        ) : !hasRows ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Aucun planning, repos ou pointage trouv\u00e9 pour cette date.
          </p>
        ) : (
          <section className="overflow-x-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e]">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead className="bg-[#334149] text-left">
                <tr>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                    Employ\u00e9
                  </th>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                    Planning
                  </th>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                    Statut
                  </th>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                    Heure arriv\u00e9e
                  </th>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                    Adresse IP
                  </th>
                  <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
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
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                        <p className="font-semibold text-[#e1e3e4]">{row.name}</p>
                        <p className="mt-1 text-xs text-[#acbdc5]">{row.group}</p>
                      </td>
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                        {row.repos ? (
                          <p className="font-semibold text-[#acbdc5]">Repos</p>
                        ) : row.planning.length > 0 ? (
                          <div className="space-y-2">
                            {row.planning.map((planningRow, index) => (
                              <p key={planningRow.id || `${row.key}-${index}`}>
                                <span className="font-semibold text-[#e1e3e4]">
                                  {getShiftName(planningRow)}
                                </span>
                                <span className="text-[#acbdc5]">
                                  {" "}
                                  - {getRoleName(planningRow)}
                                </span>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[#acbdc5]">Aucun planning</p>
                        )}
                      </td>
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
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
                            className="h-9 w-32 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2 text-sm font-semibold text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                          />
                        ) : (
                          <span className="text-[#acbdc5]">-</span>
                        )}
                      </td>
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#acbdc5]">
                        {getString(row.presence, ["adresse_ip"]) || "-"}
                      </td>
                      <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                        {row.presence ? (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={edit.statut}
                              onChange={(event) =>
                                updateEdit(row.key, {
                                  statut: event.target.value,
                                })
                              }
                              className="h-9 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2 text-sm font-semibold text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                            >
                              <option value={STATUS_PRESENT}>Pr\u00e9sent</option>
                              <option value={STATUS_ABSENT}>Absent</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => saveExistingPresence(row)}
                              disabled={isRowBusy}
                              className="h-9 bg-[#1AB6FF] px-3 text-sm font-bold text-white transition hover:bg-[#169CDC] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isRowBusy ? "..." : "Enregistrer"}
                            </button>
                          </div>
                        ) : row.repos ? (
                          <span className="text-sm text-[#acbdc5]">
                            Aucune action pendant repos
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => createPresence(row, STATUS_PRESENT)}
                              disabled={isRowBusy}
                              className="h-9 border border-emerald-300/30 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Marquer pr\u00e9sent
                            </button>
                            <button
                              type="button"
                              onClick={() => createPresence(row, STATUS_ABSENT)}
                              disabled={isRowBusy}
                              className="h-9 border border-red-300/30 px-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-70"
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
