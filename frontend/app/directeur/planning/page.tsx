"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import DirecteurNavbar from "@/components/DirecteurNavbar";
import { ApiError, apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
} from "@/lib/auth";

type DashboardCounts = {
  employesActifs: number;
  planning: number;
  presents: number;
  absents: number;
  repos: number;
  congesEnAttente: number;
  certificatsEnAttente: number;
};

type PlanningRow = {
  id?: number | string;
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  periode_travail?: string | null;
  role_travail?: string | null;
};

type PresenceRow = {
  id?: number | string;
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  heure_arrivee?: string | null;
  statut?: string | null;
};

type ReposRow = {
  id?: number | string;
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  type?: string | null;
};

type CongeRow = {
  id?: number | string;
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  date_debut?: string | null;
  date_fin?: string | null;
  nombre_jours?: number | null;
  type_conge?: string | null;
};

type CertificatRow = {
  id?: number | string;
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  date_debut_absence?: string | null;
  date_fin_absence?: string | null;
  total_jours_absence?: number | null;
};

type DashboardPayload = {
  date: string;
  counts: DashboardCounts;
  planning: PlanningRow[];
  repos: ReposRow[];
  presence: PresenceRow[];
  congesEnAttente: CongeRow[];
  certificatsEnAttente: CertificatRow[];
};

type SummaryCardProps = {
  label: string;
  value: number;
  caption: string;
};

type SectionEmptyStateProps = {
  message: string;
};

type PlanningSectionProps = {
  title: string;
  rows: PlanningRow[];
  presenceByEmployee: Map<string, PresenceRow>;
};

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const STATUS_NOT_POINTED = "Non point\u00e9";
const SHIFT_ORDER = ["Matin", "Soir", "Nuit"] as const;

type DateOption = {
  value: string;
  label: string;
  weekLabel: string;
};

type PresenceSummaryRow = {
  key: string;
  employeeName: string;
  groupe: string;
  planning: PlanningRow[];
  presence: PresenceRow | null;
};

function getDatePart(parts: Intl.DateTimeFormatPart[], type: "year" | "month" | "day") {
  return parts.find((part) => part.type === type)?.value || "";
}

function getTodayDateValue() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());

  return `${getDatePart(parts, "year")}-${getDatePart(parts, "month")}-${getDatePart(parts, "day")}`;
}

function formatDateLabel(dateValue: string) {
  if (!dateValue) {
    return "-";
  }

  const parsedDate = new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return parsedDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDateLabel(dateValue: string) {
  if (!dateValue) {
    return "-";
  }

  const parsedDate = new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return parsedDate.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function getStartOfWeek(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  return addDays(date, mondayOffset);
}

function buildDateOptions(todayValue: string): DateOption[] {
  const startOfWeek = getStartOfWeek(todayValue);

  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(startOfWeek, index);
    const value = formatDateValue(date);

    return {
      value,
      label: formatShortDateLabel(value),
      weekLabel: index < 7 ? "Cette semaine" : "Semaine prochaine",
    };
  });
}

function getEmployeeName(row: {
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
}) {
  const fullName = row.full_name?.trim();

  if (fullName) {
    return fullName;
  }

  const fallbackName = [row.prenom, row.nom].filter(Boolean).join(" ").trim();

  return fallbackName || "Employ\u00e9 non d\u00e9fini";
}

function getEmployeeKey(row: {
  employe_id?: number | string;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
}) {
  if (row.employe_id !== undefined && row.employe_id !== null) {
    return String(row.employe_id);
  }

  return getEmployeeName(row).toLowerCase();
}

function getPlanningDescription(rows: PlanningRow[]) {
  if (rows.length === 0) {
    return "Aucun planning";
  }

  return rows
    .map((row) => {
      const shift = row.periode_travail || "P\u00e9riode non d\u00e9finie";
      const role = row.role_travail || "R\u00f4le non d\u00e9fini";

      return `${shift} - ${role}`;
    })
    .join(", ");
}

function createEmptyDashboard(date: string): DashboardPayload {
  return {
    date,
    counts: {
      employesActifs: 0,
      planning: 0,
      presents: 0,
      absents: 0,
      repos: 0,
      congesEnAttente: 0,
      certificatsEnAttente: 0,
    },
    planning: [],
    repos: [],
    presence: [],
    congesEnAttente: [],
    certificatsEnAttente: [],
  };
}

function normalizeDashboardPayload(payload: DashboardPayload, requestedDate: string) {
  return {
    date: payload.date || requestedDate,
    counts: {
      employesActifs: Number(payload.counts?.employesActifs || 0),
      planning: Number(payload.counts?.planning || 0),
      presents: Number(payload.counts?.presents || 0),
      absents: Number(payload.counts?.absents || 0),
      repos: Number(payload.counts?.repos || 0),
      congesEnAttente: Number(payload.counts?.congesEnAttente || 0),
      certificatsEnAttente: Number(payload.counts?.certificatsEnAttente || 0),
    },
    planning: Array.isArray(payload.planning) ? payload.planning : [],
    repos: Array.isArray(payload.repos) ? payload.repos : [],
    presence: Array.isArray(payload.presence) ? payload.presence : [],
    congesEnAttente: Array.isArray(payload.congesEnAttente)
      ? payload.congesEnAttente
      : [],
    certificatsEnAttente: Array.isArray(payload.certificatsEnAttente)
      ? payload.certificatsEnAttente
      : [],
  };
}

function getStatusBadgeClass(status: string) {
  if (status === STATUS_PRESENT) {
    return "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]";
  }

  if (status === STATUS_ABSENT) {
    return "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]";
  }

  return "border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] text-[var(--color-badge-text)]";
}

function SummaryCard({ label, value, caption }: SummaryCardProps) {
  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_14px_30px_rgba(17,24,28,0.12)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{caption}</p>
    </article>
  );
}

function SectionEmptyState({ message }: SectionEmptyStateProps) {
  return (
    <p className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
      {message}
    </p>
  );
}

function PlanningSection({ title, rows, presenceByEmployee }: PlanningSectionProps) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
          <span className="border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
            {rows.length}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Aucun employ\u00e9 affect\u00e9.
          </p>
        ) : (
          rows.map((row, index) => {
            const presenceStatus =
              presenceByEmployee.get(getEmployeeKey(row))?.statut || STATUS_NOT_POINTED;

            return (
              <article
                key={row.id || `${title}-${index}`}
                className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">
                      {getEmployeeName(row)}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {row.periode_travail || title} - {row.role_travail || "R\u00f4le non d\u00e9fini"}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      {row.groupe || "Groupe non d\u00e9fini"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 border px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(
                      presenceStatus
                    )}`}
                  >
                    {presenceStatus}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function PresenceList({
  title,
  rows,
  emptyMessage,
  status,
}: {
  title: string;
  rows: PresenceSummaryRow[];
  emptyMessage: string;
  status: string;
}) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        <span
          className={`border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
            status
          )}`}
        >
          {rows.length}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{emptyMessage}</p>
        ) : (
          rows.map((row) => (
            <article
              key={row.key}
              className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">
                    {row.employeeName}
                  </h4>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {row.groupe}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {getPlanningDescription(row.planning)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                      row.presence?.statut || status
                    )}`}
                  >
                    {row.presence?.statut || status}
                  </span>
                  {row.presence?.heure_arrivee ? (
                    <span className="text-sm font-semibold text-[var(--color-text)]">
                      {row.presence.heure_arrivee}
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function DirecteurPage() {
  const router = useRouter();
  const todayValue = useMemo(() => getTodayDateValue(), []);
  const dateOptions = useMemo(() => buildDateOptions(todayValue), [todayValue]);
  const [isAllowed, setIsAllowed] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  const loadDashboard = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiFetch<DashboardPayload>(
        `/api/directeur/dashboard?date=${encodeURIComponent(selectedDate)}`
      );

      setDashboard(normalizeDashboardPayload(payload, selectedDate));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearAuth();
        router.push("/");
        return;
      }

      setDashboard(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger le tableau de bord directeur."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAllowed, router, selectedDate]);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    void loadDashboard();
  }, [isAllowed, loadDashboard]);

  const resolvedDashboard = dashboard || createEmptyDashboard(selectedDate);
  const planningByShift = useMemo(() => {
    return SHIFT_ORDER.reduce<Record<string, PlanningRow[]>>((result, shift) => {
      result[shift] = resolvedDashboard.planning.filter(
        (row) => row.periode_travail === shift
      );

      return result;
    }, {});
  }, [resolvedDashboard.planning]);
  const presenceByEmployee = useMemo(() => {
    const result = new Map<string, PresenceRow>();

    resolvedDashboard.presence.forEach((row) => {
      result.set(getEmployeeKey(row), row);
    });

    return result;
  }, [resolvedDashboard.presence]);
  const planningByEmployee = useMemo(() => {
    const result = new Map<string, PlanningRow[]>();

    resolvedDashboard.planning.forEach((row) => {
      const key = getEmployeeKey(row);
      const rows = result.get(key) || [];
      rows.push(row);
      result.set(key, rows);
    });

    return result;
  }, [resolvedDashboard.planning]);
  const presenceSummaryRows = useMemo(() => {
    const result = new Map<string, PresenceSummaryRow>();

    resolvedDashboard.planning.forEach((row) => {
      const key = getEmployeeKey(row);
      const planningRows = result.get(key)?.planning || [];

      result.set(key, {
        key,
        employeeName: getEmployeeName(row),
        groupe: row.groupe || "Groupe non d\u00e9fini",
        planning: [...planningRows, row],
        presence: presenceByEmployee.get(key) || null,
      });
    });

    resolvedDashboard.presence.forEach((row) => {
      const key = getEmployeeKey(row);

      if (result.has(key)) {
        result.set(key, {
          ...result.get(key)!,
          presence: row,
        });
        return;
      }

      result.set(key, {
        key,
        employeeName: getEmployeeName(row),
        groupe: row.groupe || "Groupe non d\u00e9fini",
        planning: planningByEmployee.get(key) || [],
        presence: row,
      });
    });

    return Array.from(result.values()).sort((leftRow, rightRow) =>
      leftRow.employeeName.localeCompare(rightRow.employeeName, "fr")
    );
  }, [
    planningByEmployee,
    presenceByEmployee,
    resolvedDashboard.planning,
    resolvedDashboard.presence,
  ]);
  const presentRows = useMemo(() => {
    return presenceSummaryRows.filter((row) => row.presence?.statut === STATUS_PRESENT);
  }, [presenceSummaryRows]);
  const absenceRows = useMemo(() => {
    return presenceSummaryRows.filter((row) => row.presence?.statut === STATUS_ABSENT);
  }, [presenceSummaryRows]);
  const notPointedRows = useMemo(() => {
    return presenceSummaryRows.filter(
      (row) => row.planning.length > 0 && !row.presence
    );
  }, [presenceSummaryRows]);

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
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              Planning Directeur
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Vue quotidienne en lecture seule du planning, des repos et des pr\u00e9sences.
            </p>
          </div>

          <label className="flex w-full max-w-[240px] flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
            Date
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-11 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
            >
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.weekLabel}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-[var(--color-text-muted)]">
              Cette semaine et semaine prochaine uniquement.
            </span>
          </label>
        </div>

        <section className="mb-6 border border-l-4 border-[var(--color-border)] border-l-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                Acc\u00e8s directeur
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Toutes les donn\u00e9es affich\u00e9es sont consultatives. Aucun bouton
                d&apos;action sensible n&apos;est disponible sur cet espace.
              </p>
            </div>
            <span className="w-fit border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-badge-text)]">
              {formatDateLabel(resolvedDashboard.date)}
            </span>
          </div>
        </section>

        {errorMessage ? (
          <p className="mb-6 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Planning du jour"
            value={resolvedDashboard.counts.planning}
            caption="Affectations consultables"
          />
          <SummaryCard
            label="Pr\u00e9sences du jour"
            value={resolvedDashboard.counts.presents}
            caption="Pointages enregistr\u00e9s"
          />
          <SummaryCard
            label="Absences du jour"
            value={resolvedDashboard.counts.absents}
            caption="Statuts absents confirm\u00e9s"
          />
          <SummaryCard
            label="Non point\u00e9s"
            value={notPointedRows.length}
            caption="Planifi\u00e9s sans pointage"
          />
          <SummaryCard
            label="Repos du jour"
            value={resolvedDashboard.counts.repos}
            caption="Employ\u00e9s en repos"
          />
        </div>

        {isLoading ? (
          <SectionEmptyState message="Chargement des donn\u00e9es du directeur..." />
        ) : (
          <div className="space-y-8">
            <section id="planning">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-[var(--color-text)]">
                  Planning du jour
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  R\u00e9partition par p\u00e9riode: Matin, Soir et Nuit.
                </p>
              </div>

              {resolvedDashboard.planning.length === 0 ? (
                <SectionEmptyState message="Aucun planning trouv\u00e9 pour cette date." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {SHIFT_ORDER.map((shift) => (
                    <PlanningSection
                      key={shift}
                      title={shift}
                      rows={planningByShift[shift]}
                      presenceByEmployee={presenceByEmployee}
                    />
                  ))}
                </div>
              )}
            </section>

            <section id="presence">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-[var(--color-text)]">
                  Pr\u00e9sence du jour
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Comptes rendus de pointage et statuts enregistr\u00e9s.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <section className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-base font-semibold text-[var(--color-text)]">
                    Synth\u00e8se
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {[
                      {
                        label: "Pr\u00e9sents",
                        value: resolvedDashboard.counts.presents,
                        status: STATUS_PRESENT,
                      },
                      {
                        label: "Absents",
                        value: resolvedDashboard.counts.absents,
                        status: STATUS_ABSENT,
                      },
                      {
                        label: "Non point\u00e9s",
                        value: notPointedRows.length,
                        status: STATUS_NOT_POINTED,
                      },
                      {
                        label: "Repos",
                        value: resolvedDashboard.counts.repos,
                        status: "Repos",
                      },
                    ].map((item) => (
                      <article
                        key={item.label}
                        className="flex items-center justify-between gap-3 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3"
                      >
                        <span className="text-sm font-semibold text-[var(--color-text)]">
                          {item.label}
                        </span>
                        <span
                          className={`border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                            item.status
                          )}`}
                        >
                          {item.value}
                        </span>
                      </article>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-3">
                  <PresenceList
                    title="Pr\u00e9sent"
                    rows={presentRows}
                    emptyMessage="Aucun employ\u00e9 pr\u00e9sent pour cette date."
                    status={STATUS_PRESENT}
                  />
                  <PresenceList
                    title="Absent"
                    rows={absenceRows}
                    emptyMessage="Aucune absence enregistr\u00e9e pour cette date."
                    status={STATUS_ABSENT}
                  />
                  <PresenceList
                    title="Non point\u00e9"
                    rows={notPointedRows}
                    emptyMessage="Aucun employ\u00e9 planifi\u00e9 sans pointage."
                    status={STATUS_NOT_POINTED}
                  />
                </div>
              </div>
            </section>

            <section id="repos">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-[var(--color-text)]">
                  Repos du jour
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Employ\u00e9s non planifi\u00e9s pour la date consult\u00e9e.
                </p>
              </div>

              {resolvedDashboard.repos.length === 0 ? (
                <SectionEmptyState message="Aucun repos trouv\u00e9 pour cette date." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {resolvedDashboard.repos.map((row, index) => (
                    <article
                      key={row.id || `repos-${index}`}
                      className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[var(--color-text)]">
                            {getEmployeeName(row)}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {row.groupe || "Groupe non d\u00e9fini"}
                          </p>
                        </div>
                        <span className="border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
                          {row.type || "Repos"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </section>
    </main>
  );
}
