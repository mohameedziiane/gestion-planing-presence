"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type NestedRecord = Record<string, unknown>;
type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe?: string | NestedRecord;
  periode?: string | NestedRecord;
  role_travail?: string | NestedRecord;
};
type GenerationResult = {
  message?: string;
  week?: {
    startDate?: string;
    endDate?: string;
  };
  planning?: ApiRow[];
  repos?: ApiRow[];
  warnings?: string[];
  errors?: string[];
};

const shifts = ["Matin", "Soir", "Nuit"];

function getNextMondayOrToday() {
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 1;

  date.setDate(date.getDate() + daysUntilMonday);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${dayOfMonth}`;
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

function getDateValue(row: ApiRow) {
  return getString(row, ["_date", "date"]) || "Date non définie";
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
  return getString(row, ["type", "repos_type"]) || "Repos";
}

function groupPlanningByShift(rows: ApiRow[]) {
  return shifts.reduce<Record<string, ApiRow[]>>((result, shift) => {
    result[shift] = rows.filter(
      (row) => normalizeText(getShiftName(row)) === normalizeText(shift)
    );

    return result;
  }, {});
}

function groupReposByDate(rows: ApiRow[]) {
  return rows.reduce<Record<string, ApiRow[]>>((result, row) => {
    const date = getDateValue(row);

    if (!result[date]) {
      result[date] = [];
    }

    result[date].push(row);

    return result;
  }, {});
}

function Alert({
  tone,
  children,
}: {
  tone: "success" | "error" | "warning";
  children: React.ReactNode;
}) {
  const classes = {
    success: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
    error: "border-red-300/30 bg-red-500/10 text-red-100",
    warning: "border-yellow-300/30 bg-yellow-500/10 text-yellow-100",
  };

  return <div className={`border px-4 py-3 text-sm ${classes[tone]}`}>{children}</div>;
}

function PlanningPreview({ rows }: { rows: ApiRow[] }) {
  const rowsByShift = groupPlanningByShift(rows);

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
        Aperçu du planning généré
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {shifts.map((shift) => (
          <section
            key={shift}
            className="border border-[rgba(172,189,197,0.15)] bg-[#38474e]"
          >
            <div className="border-b border-[rgba(172,189,197,0.15)] px-4 py-3">
              <h3 className="text-base font-semibold text-[#e1e3e4]">{shift}</h3>
              <p className="text-xs text-[#acbdc5]">
                {rowsByShift[shift].length} ligne(s)
              </p>
            </div>
            <div className="space-y-3 p-4">
              {rowsByShift[shift].length === 0 ? (
                <p className="text-sm text-[#acbdc5]">Aucune ligne.</p>
              ) : (
                rowsByShift[shift].map((row, index) => (
                  <article
                    key={row.id || `${shift}-${index}`}
                    className="border border-[rgba(172,189,197,0.15)] bg-[#334149] p-3"
                  >
                    <p className="text-xs text-[#acbdc5]">{getDateValue(row)}</p>
                    <h4 className="mt-1 text-sm font-semibold text-[#e1e3e4]">
                      {getEmployeeName(row) || "Employé non défini"}
                    </h4>
                    <p className="mt-1 text-sm text-[#acbdc5]">{getRoleName(row)}</p>
                    <p className="mt-2 text-xs text-[#acbdc5]">{getGroupName(row)}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ReposPreview({ rows }: { rows: ApiRow[] }) {
  const rowsByDate = groupReposByDate(rows);
  const dates = Object.keys(rowsByDate).sort();

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
        Aperçu des repos générés
      </h2>
      {dates.length === 0 ? (
        <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
          Aucun repos retourné.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {dates.map((date) => (
            <section
              key={date}
              className="border border-[rgba(172,189,197,0.15)] bg-[#38474e]"
            >
              <div className="border-b border-[rgba(172,189,197,0.15)] px-4 py-3">
                <h3 className="text-base font-semibold text-[#e1e3e4]">{date}</h3>
                <p className="text-xs text-[#acbdc5]">
                  {rowsByDate[date].length} repos
                </p>
              </div>
              <div className="space-y-3 p-4">
                {rowsByDate[date].map((row, index) => (
                  <article
                    key={row.id || `${date}-${index}`}
                    className="border border-[rgba(172,189,197,0.15)] bg-[#334149] p-3"
                  >
                    <h4 className="text-sm font-semibold text-[#e1e3e4]">
                      {getEmployeeName(row) || "Employé non défini"}
                    </h4>
                    <p className="mt-1 text-sm text-[#acbdc5]">
                      Type: {getReposType(row)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminPlanningPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState(getNextMondayOrToday);
  const [weekNumber, setWeekNumber] = useState(1);
  const [overwrite, setOverwrite] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendErrors, setBackendErrors] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const planningRows = result?.planning || [];
  const reposRows = result?.repos || [];
  const warnings = result?.warnings || [];
  const weekLabel = useMemo(() => {
    if (!result?.week?.startDate && !result?.week?.endDate) {
      return "";
    }

    return `${result.week.startDate || ""} - ${result.week.endDate || ""}`;
  }, [result]);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/");
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
    router.push("/");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");
    setBackendErrors([]);
    setResult(null);

    try {
      const response = await fetch(
        "http://localhost:5000/api/planning-generation/week",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            startDate,
            weekNumber,
            overwrite,
          }),
        }
      );
      const data = (await response.json()) as GenerationResult;

      if (!response.ok) {
        setErrorMessage(data.message || "Impossible de générer le planning.");
        setBackendErrors(Array.isArray(data.errors) ? data.errors : []);
        return;
      }

      setResult(data);
      setSuccessMessage("Planning généré avec succès.");
    } catch {
      setErrorMessage("Impossible de contacter le serveur backend.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#4c595f] text-[#e1e3e4]">
      <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
        <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src="/logo.webp"
                alt="Gare Routière de Taza"
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain"
              />
              <span className="hidden text-sm font-semibold text-[#e1e3e4] sm:block">
                Gare Routière de Taza
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/admin"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Accueil
              </Link>
              <Link
                href="/admin/planning"
                className="border-b-2 border-[#1AB6FF] px-3 py-2 text-sm font-semibold text-[#e1e3e4]"
              >
                Planning
              </Link>
              <Link
                href="/admin/employes"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Employés
              </Link>
              <Link
                href="/admin/repos"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Repos
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#e1e3e4]">Admin</span>
            <button
              type="button"
              onClick={handleLogout}
              className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Gestion du planning
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Générer le planning hebdomadaire des employés
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mb-6 border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 sm:p-5"
        >
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="space-y-2 text-sm font-semibold text-[#acbdc5]">
              <span>Date de début</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-11 w-full border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-sm text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                required
              />
              <span className="block text-xs font-normal text-[#acbdc5]">
                La date doit être un lundi.
              </span>
            </label>

            <label className="space-y-2 text-sm font-semibold text-[#acbdc5]">
              <span>Numéro de semaine</span>
              <input
                type="number"
                min={1}
                value={weekNumber}
                onChange={(event) => setWeekNumber(Number(event.target.value))}
                className="h-11 w-full border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-sm text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                required
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-[#acbdc5]">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(event) => setOverwrite(event.target.checked)}
                className="h-4 w-4 accent-[#1AB6FF]"
              />
              Remplacer le planning existant pour cette semaine
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="h-11 bg-[#1AB6FF] px-5 text-sm font-bold text-white transition hover:bg-[#169CDC] disabled:cursor-not-allowed disabled:bg-[#169CDC]"
            >
              {isLoading ? "Génération..." : "Générer planning"}
            </button>
          </div>
        </form>

        <div className="space-y-5">
          {successMessage ? (
            <Alert tone="success">
              <p className="font-semibold">{successMessage}</p>
              {weekLabel ? <p className="mt-1">Semaine: {weekLabel}</p> : null}
            </Alert>
          ) : null}

          {errorMessage ? (
            <Alert tone="error">
              <p className="font-semibold">{errorMessage}</p>
              {backendErrors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {backendErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}

          {warnings.length > 0 ? (
            <Alert tone="warning">
              <p className="font-semibold">Avertissements</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {result ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                    Lignes planning
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#e1e3e4]">
                    {planningRows.length}
                  </p>
                </article>
                <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                    Lignes repos
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#e1e3e4]">
                    {reposRows.length}
                  </p>
                </article>
              </div>

              <PlanningPreview rows={planningRows} />
              <ReposPreview rows={reposRows} />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
