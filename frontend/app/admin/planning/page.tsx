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
    weekNumber?: number;
  };
  planning?: ApiRow[];
  repos?: ApiRow[];
  warnings?: string[];
  errors?: string[];
};

const shifts = ["Matin", "Soir", "Nuit"];
const PLANNING_WEEK_ANCHOR_DATE = "2026-05-04";

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

function parseLocalDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

function formatDateForDisplay(dateValue: string) {
  const date = parseLocalDate(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("fr-FR");
}

function getCalculatedWeekNumber(startDate: string) {
  const selectedDate = parseLocalDate(startDate);
  const anchorDate = parseLocalDate(PLANNING_WEEK_ANCHOR_DATE);

  if (
    Number.isNaN(selectedDate.getTime()) ||
    Number.isNaN(anchorDate.getTime())
  ) {
    return null;
  }

  const daysDiff = Math.floor(
    (selectedDate.getTime() - anchorDate.getTime()) / 86400000
  );

  if (daysDiff < 0) {
    return null;
  }

  return Math.floor(daysDiff / 7) + 1;
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

function normalizeDateValue(value: unknown) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.slice(0, 10);
}

function getNormalizedDate(row: ApiRow) {
  return normalizeDateValue(getString(row, ["_date", "date"]));
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

function addDays(dateValue: string, offset: number) {
  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setDate(date.getDate() + offset);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildWeekDays(
  week: GenerationResult["week"] | undefined,
  planningRows: ApiRow[],
  reposRows: ApiRow[]
) {
  const startDate =
    normalizeDateValue(week?.startDate) ||
    [...planningRows, ...reposRows]
      .map(getNormalizedDate)
      .filter(Boolean)
      .sort()[0] ||
    "";

  if (!startDate) {
    return [];
  }

  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index)).filter(Boolean);
}

function getRoleStatus(row: ApiRow) {
  const shift = normalizeText(getShiftName(row));

  if (shift === "nuit") {
    return "NUIT";
  }

  const role = getRoleName(row);

  if (!role || normalizeText(role).includes("non defini")) {
    return "-";
  }

  return role.toUpperCase();
}

function getCellClass(status: string) {
  const normalized = normalizeText(status);

  if (normalized === "repos") {
    return "border-[rgba(225,227,228,0.22)] bg-[#45545b] text-[#e1e3e4]";
  }

  if (normalized === "nuit") {
    return "border-red-300/25 bg-red-950/35 text-red-100";
  }

  if (normalized.includes("controle")) {
    return "border-yellow-300/25 bg-yellow-500/10 font-bold text-yellow-100";
  }

  return "border-[rgba(172,189,197,0.15)] bg-[#334149] text-[#e1e3e4]";
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

function WeeklyPlanningPreview({
  planningRows,
  reposRows,
  week,
}: {
  planningRows: ApiRow[];
  reposRows: ApiRow[];
  week: GenerationResult["week"] | undefined;
}) {
  const weekDays = buildWeekDays(week, planningRows, reposRows);
  const dayLabels = [
    "LUNDI",
    "MARDI",
    "MERCREDI",
    "JEUDI",
    "VENDREDI",
    "SAMEDI",
    "DIMANCHE",
  ];
  const rowsByShift = groupPlanningByShift(planningRows);
  const planningByEmployeeDate = new Map<string, ApiRow>();
  const reposByEmployeeDate = new Map<string, ApiRow>();
  const nightByDate = new Map<string, ApiRow>();

  planningRows.forEach((row) => {
    const employeeName = getEmployeeName(row);
    const date = getNormalizedDate(row);

    if (!employeeName || !date) {
      return;
    }

    planningByEmployeeDate.set(`${normalizeText(employeeName)}|${date}`, row);

    if (normalizeText(getShiftName(row)) === "nuit") {
      nightByDate.set(date, row);
    }
  });

  reposRows.forEach((row) => {
    const employeeName = getEmployeeName(row);
    const date = getNormalizedDate(row);

    if (!employeeName || !date) {
      return;
    }

    reposByEmployeeDate.set(`${normalizeText(employeeName)}|${date}`, row);
  });

  function getSectionEmployees(shift: "Matin" | "Soir") {
    const sectionGroup = getGroupName(rowsByShift[shift][0] || {});
    const employees = new Map<string, { name: string; group: string }>();

    planningRows.forEach((row) => {
      const name = getEmployeeName(row);
      const group = getGroupName(row);
      const currentShift = normalizeText(getShiftName(row));
      const matchesShift = normalizeText(shift) === currentShift;
      const matchesGroup =
        sectionGroup &&
        normalizeText(sectionGroup) !== "groupe non defini" &&
        normalizeText(group) === normalizeText(sectionGroup);

      if (name && (matchesShift || (matchesGroup && currentShift !== "nuit"))) {
        employees.set(normalizeText(name), { name, group });
      }
    });

    reposRows.forEach((row) => {
      const name = getEmployeeName(row);
      const group = getGroupName(row);
      const matchesGroup =
        sectionGroup &&
        normalizeText(sectionGroup) !== "groupe non defini" &&
        normalizeText(group) === normalizeText(sectionGroup);

      if (name && matchesGroup) {
        employees.set(normalizeText(name), { name, group });
      }
    });

    return Array.from(employees.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  function getEmployeeCell(employeeName: string, date: string) {
    const key = `${normalizeText(employeeName)}|${date}`;
    const planningRow = planningByEmployeeDate.get(key);

    if (planningRow) {
      return getRoleStatus(planningRow);
    }

    if (reposByEmployeeDate.has(key)) {
      return "REPOS";
    }

    return "-";
  }

  function renderEmployeeSection(shift: "Matin" | "Soir") {
    const employees = getSectionEmployees(shift);

    return (
      <>
        <tr className="bg-[#2f3d44]">
          <th
            colSpan={8}
            className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-[#1AB6FF]"
          >
            {shift.toUpperCase()}
          </th>
        </tr>
        {employees.length === 0 ? (
          <tr>
            <td
              colSpan={8}
              className="border border-[rgba(172,189,197,0.15)] px-4 py-4 text-sm text-[#acbdc5]"
            >
              Aucune ligne.
            </td>
          </tr>
        ) : (
          employees.map((employee) => (
            <tr key={`${shift}-${employee.name}`}>
              <th className="min-w-56 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-4 py-3 text-left align-top">
                <span className="block text-sm font-semibold text-[#e1e3e4]">
                  {employee.name}
                </span>
                <span className="mt-1 block text-xs font-normal text-[#acbdc5]">
                  {employee.group}
                </span>
              </th>
              {weekDays.map((date) => {
                const status = getEmployeeCell(employee.name, date);

                return (
                  <td
                    key={`${employee.name}-${date}`}
                    className={`min-w-32 border px-3 py-3 text-center text-xs font-semibold ${getCellClass(status)}`}
                  >
                    {status}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </>
    );
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-[#e1e3e4]">
          Aperçu du planning généré
        </h2>
        <p className="mt-1 text-sm text-[#acbdc5]">
          Vue hebdomadaire par employé et par jour
        </p>
      </div>

      {weekDays.length === 0 ? (
        <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
          Aucun planning retourné.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e]">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#334149]">
                <th className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#acbdc5]">
                  Employé
                </th>
                {weekDays.map((date, index) => (
                  <th
                    key={date}
                    className="border border-[rgba(172,189,197,0.15)] px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-[#acbdc5]"
                  >
                    <span className="block text-[#e1e3e4]">{dayLabels[index]}</span>
                    <span className="mt-1 block font-normal normal-case text-[#acbdc5]">
                      {date}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderEmployeeSection("Matin")}
              {renderEmployeeSection("Soir")}
              <tr className="bg-[#2f3d44]">
                <th
                  colSpan={8}
                  className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-[#1AB6FF]"
                >
                  NUIT
                </th>
              </tr>
              <tr>
                <th className="min-w-56 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-4 py-3 text-left text-sm font-semibold text-[#e1e3e4]">
                  Employé Nuit
                </th>
                {weekDays.map((date) => {
                  const nightRow = nightByDate.get(date);
                  const employeeName = nightRow
                    ? getEmployeeName(nightRow) || "Employé non défini"
                    : "-";

                  return (
                    <td
                      key={`night-${date}`}
                      className={`min-w-32 border px-3 py-3 text-center text-xs font-semibold ${getCellClass(
                        nightRow ? "NUIT" : "-"
                      )}`}
                    >
                      {employeeName}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
  const [overwrite, setOverwrite] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendErrors, setBackendErrors] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const planningRows = result?.planning || [];
  const reposRows = result?.repos || [];
  const warnings = result?.warnings || [];
  const calculatedWeekNumber = useMemo(
    () => getCalculatedWeekNumber(startDate),
    [startDate]
  );
  const startDateValidationMessage =
    calculatedWeekNumber === null
      ? `La date doit être à partir du ${formatDateForDisplay(
          PLANNING_WEEK_ANCHOR_DATE
        )}.`
      : "";
  const weekLabel = useMemo(() => {
    if (!result?.week?.startDate && !result?.week?.endDate) {
      return "";
    }

    const responseWeekNumber = result.week.weekNumber
      ? `Semaine ${result.week.weekNumber} - `
      : "";

    return `${responseWeekNumber}${result.week.startDate || ""} - ${
      result.week.endDate || ""
    }`;
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

    if (calculatedWeekNumber === null) {
      setErrorMessage(startDateValidationMessage);
      setBackendErrors([]);
      setResult(null);
      return;
    }

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
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
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
              {startDateValidationMessage ? (
                <span className="block text-xs font-semibold text-red-100">
                  {startDateValidationMessage}
                </span>
              ) : null}
            </label>

            <div className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                Semaine calculée automatiquement
              </p>
              <p className="mt-2 text-xl font-semibold text-[#e1e3e4]">
                {calculatedWeekNumber ? `Semaine ${calculatedWeekNumber}` : "-"}
              </p>
            </div>
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
              disabled={isLoading || calculatedWeekNumber === null}
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

              <WeeklyPlanningPreview
                planningRows={planningRows}
                reposRows={reposRows}
                week={result.week}
              />
              <ReposPreview rows={reposRows} />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
