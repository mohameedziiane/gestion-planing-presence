"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AdminNavbar from "@/components/AdminNavbar";
import { API_BASE_URL, translateUserMessage } from "@/lib/api";

type DayOption = "yesterday" | "today" | "tomorrow";
type NestedRecord = Record<string, unknown>;
type ReposRow = Record<string, unknown> & {
  id?: number | string;
  employe?: string | NestedRecord;
};

const dayOptions: { value: DayOption; label: string; offset: number }[] = [
  { value: "yesterday", label: "Hier", offset: -1 },
  { value: "today", label: "Aujourd'hui", offset: 0 },
  { value: "tomorrow", label: "Demain", offset: 1 },
];

function formatDateWithOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function getNested(row: NestedRecord, key: string) {
  const value = row[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NestedRecord)
    : null;
}

function getEmployeeName(row: ReposRow) {
  const directName = getString(row, ["full_name", "employe_nom_complet"]);

  if (directName) {
    return directName;
  }

  if (typeof row.employe === "string" && row.employe.trim()) {
    return row.employe.trim();
  }

  const employe = getNested(row, "employe");

  if (employe) {
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

function getGroupName(row: ReposRow) {
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

function getDateValue(row: ReposRow) {
  return getString(row, ["_date", "date"]) || "Date non définie";
}

function getReposType(row: ReposRow) {
  return getString(row, ["type", "repos_type"]) || "Repos";
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  );
}

export default function AdminReposPage() {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<DayOption>("today");
  const [reposRows, setReposRows] = useState<ReposRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedDate = useMemo(() => {
    const option = dayOptions.find((item) => item.value === selectedDay);

    return formatDateWithOffset(option?.offset || 0);
  }, [selectedDay]);

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

    async function fetchRepos() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/repos/date/${selectedDate}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        );
        const data = await response.json();

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          setError(
            translateUserMessage(data?.message || "Impossible de charger les repos.")
          );
          setReposRows([]);
          return;
        }

        setReposRows(Array.isArray(data) ? data : []);
      } catch {
        if (isActive) {
          setError("Impossible de contacter le serveur backend.");
          setReposRows([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    fetchRepos();

    return () => {
      isActive = false;
    };
  }, [router, selectedDate]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
              Gestion des repos
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Consulter les repos des employés par date
            </p>
          </div>

          <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
            Date
            <select
              value={selectedDay}
              onChange={(event) => setSelectedDay(event.target.value as DayOption)}
              className="h-10 min-w-44 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition hover:border-[var(--color-accent-hover)] focus:border-[var(--color-accent)]"
            >
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <SummaryCard label="Date sélectionnée" value={selectedDate} />
          <SummaryCard label="Nombre repos" value={reposRows.length} />
        </div>

        {isLoading ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Chargement des repos...
          </p>
        ) : error ? (
          <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
            {error}
          </p>
        ) : reposRows.length === 0 ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Aucun repos trouvé pour cette date.
          </p>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reposRows.map((row, index) => (
              <article
                key={row.id || `repos-${index}`}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                  {getDateValue(row)}
                </p>
                <h2 className="mt-2 text-base font-semibold text-[var(--color-text)]">
                  {getEmployeeName(row) || "Employé non défini"}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{getGroupName(row)}</p>
                <p className="mt-3 w-fit border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
                  Type: {getReposType(row)}
                </p>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
