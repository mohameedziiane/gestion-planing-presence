"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import AdminNavbar from "@/components/AdminNavbar";

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
const PLANNING_WEEK_ANCHOR_DATE = "2026-04-27";
const MATIN_GROUPE_A_ORDER = ["FATIHA", "HAYAT", "MONCEF", "AYOUB", "YOUNESS"];
const SOIR_GROUPE_B_ORDER = ["ABIRE", "RAHMA", "SAID", "SABER", "TAHRA"];
const MATIN_GROUPE_B_ORDER = ["ABIRE", "RAHMA", "MONCEF", "SABER", "TAHRA"];
const SOIR_GROUPE_A_ORDER = ["FATIHA", "HAYAT", "SAID", "AYOUB", "YOUNESS"];
const GROUPE_A_MARKERS = ["FATIHA", "HAYAT", "AYOUB", "YOUNESS"];
const GROUPE_B_MARKERS = ["ABIRE", "RAHMA", "SABER", "TAHRA"];

function getCurrentWeekMonday() {
  const date = new Date();
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - daysSinceMonday);

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

function getNormalizedFirstName(name: string) {
  return normalizeText(name).split(/\s+/)[0]?.toUpperCase() || "";
}

function hasAnyEmployee(employees: { name: string }[], preferredNames: string[]) {
  const employeeNames = employees.map((employee) =>
    getNormalizedFirstName(employee.name)
  );

  return preferredNames.some((name) => employeeNames.includes(name));
}

function getPreferredEmployeeOrder(
  shift: "Matin" | "Soir",
  employees: { name: string }[]
) {
  if (shift === "Matin") {
    if (hasAnyEmployee(employees, GROUPE_B_MARKERS)) {
      return MATIN_GROUPE_B_ORDER;
    }

    if (hasAnyEmployee(employees, GROUPE_A_MARKERS)) {
      return MATIN_GROUPE_A_ORDER;
    }

    return MATIN_GROUPE_A_ORDER;
  }

  if (hasAnyEmployee(employees, GROUPE_B_MARKERS)) {
    return SOIR_GROUPE_B_ORDER;
  }

  if (hasAnyEmployee(employees, GROUPE_A_MARKERS)) {
    return SOIR_GROUPE_A_ORDER;
  }

  return SOIR_GROUPE_A_ORDER;
}

function sortEmployeesByPreferredOrder<T extends { name: string }>(
  employees: T[],
  shift: "Matin" | "Soir"
) {
  const preferredOrder = getPreferredEmployeeOrder(shift, employees);

  return [...employees].sort((a, b) => {
    const firstIndex = preferredOrder.indexOf(getNormalizedFirstName(a.name));
    const secondIndex = preferredOrder.indexOf(getNormalizedFirstName(b.name));
    const firstRank = firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex;
    const secondRank = secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex;

    if (firstRank !== secondRank) {
      return firstRank - secondRank;
    }

    return a.name.localeCompare(b.name);
  });
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

function getEmployeeKey(row: ApiRow) {
  const employe = getNested(row, "employe");
  const idValue =
    row.employe_id ||
    row.employee_id ||
    row.id_employe ||
    employe?.id ||
    employe?.employe_id ||
    employe?.employee_id ||
    employe?.id_employe;

  if (typeof idValue === "number" || typeof idValue === "string") {
    const normalizedId = String(idValue).trim();

    if (normalizedId) {
      return `id:${normalizedId}`;
    }
  }

  const employeeName = getEmployeeName(row);

  return employeeName ? `name:${normalizeText(employeeName)}` : "";
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

function getWeekDatesFromStart(startDate: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index)).filter(Boolean);
}

function getRowsFromPayload(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload as ApiRow[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value as ApiRow[];
    }
  }

  return [];
}

async function fetchRowsByDate(
  url: string,
  token: string,
  payloadKeys: string[]
) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return [];
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error("Fetch failed");
  }

  return getRowsFromPayload(payload, payloadKeys);
}

async function fetchExistingWeekPlanning(
  startDate: string,
  token: string,
  weekNumber: number
): Promise<GenerationResult> {
  const weekDays = getWeekDatesFromStart(startDate);
  const planningRequests = weekDays.map((date) =>
    fetchRowsByDate(
      `http://localhost:5000/api/planning/date/${date}`,
      token,
      ["planning", "data", "rows"]
    )
  );
  const reposRequests = weekDays.map((date) =>
    fetchRowsByDate(
      `http://localhost:5000/api/repos/date/${date}`,
      token,
      ["repos", "data", "rows"]
    )
  );
  const [planningByDay, reposByDay] = await Promise.all([
    Promise.all(planningRequests),
    Promise.all(reposRequests),
  ]);

  return {
    week: {
      startDate,
      endDate: weekDays[6] || startDate,
      weekNumber,
    },
    planning: planningByDay.flat(),
    repos: reposByDay.flat(),
  };
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

  if (normalized === "-") {
    return "border-[rgba(172,189,197,0.12)] bg-[#303d44] text-[#7f929b]";
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
  const planningByEmployeeDate = new Map<string, ApiRow>();
  const reposByEmployeeDate = new Map<string, ApiRow>();
  const nightByEmployeeDate = new Map<string, ApiRow>();
  const nightByDate = new Map<string, ApiRow>();

  planningRows.forEach((row) => {
    const employeeKey = getEmployeeKey(row);
    const date = getNormalizedDate(row);
    const shift = normalizeText(getShiftName(row));

    if (!employeeKey || !date) {
      return;
    }

    planningByEmployeeDate.set(
      `${employeeKey}|${date}|${shift}`,
      row
    );

    if (shift === "nuit") {
      nightByEmployeeDate.set(`${employeeKey}|${date}`, row);
      nightByDate.set(date, row);
    }
  });

  reposRows.forEach((row) => {
    const employeeKey = getEmployeeKey(row);
    const date = getNormalizedDate(row);

    if (!employeeKey || !date) {
      return;
    }

    reposByEmployeeDate.set(`${employeeKey}|${date}`, row);
  });

  function getSectionEmployees(shift: "Matin" | "Soir") {
    const employees = new Map<string, { key: string; name: string; group: string }>();

    planningRows.forEach((row) => {
      const employeeKey = getEmployeeKey(row);
      const name = getEmployeeName(row);
      const group = getGroupName(row);
      const currentShift = normalizeText(getShiftName(row));
      const matchesShift = normalizeText(shift) === currentShift;

      if (employeeKey && name && matchesShift) {
        employees.set(employeeKey, { key: employeeKey, name, group });
      }
    });

    return sortEmployeesByPreferredOrder(Array.from(employees.values()), shift);
  }

  function getEmployeeCell(employeeKey: string, date: string, shift: "Matin" | "Soir") {
    const employeeDateKey = `${employeeKey}|${date}`;
    const planningKey = `${employeeDateKey}|${normalizeText(shift)}`;

    if (reposByEmployeeDate.has(employeeDateKey)) {
      return "REPOS";
    }

    if (nightByEmployeeDate.has(employeeDateKey)) {
      return "NUIT";
    }

    const planningRow = planningByEmployeeDate.get(planningKey);

    if (planningRow) {
      return getRoleStatus(planningRow);
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
            className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-[#1AB6FF]"
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
                const status = getEmployeeCell(employee.key, date, shift);

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
                  className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-[#1AB6FF]"
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
  const maxReposCount = Math.max(
    1,
    ...dates.map((date) => rowsByDate[date].length)
  );
  const reposTypeCounts = rows.reduce<{ oneDay: number; twoDays: number }>(
    (counts, row) => {
      const normalizedType = normalizeText(getReposType(row)).replace(/\s/g, "");

      if (normalizedType === "1j") {
        counts.oneDay += 1;
      }

      if (normalizedType === "2j") {
        counts.twoDays += 1;
      }

      return counts;
    },
    { oneDay: 0, twoDays: 0 }
  );
  const stats = [
    { label: "Total repos", value: rows.length },
    { label: "Jours avec repos", value: dates.length },
    { label: "Repos 1j", value: reposTypeCounts.oneDay },
    { label: "Repos 2j", value: reposTypeCounts.twoDays },
  ];

  function getReposTypeBadgeClass(type: string) {
    const normalizedType = normalizeText(type).replace(/\s/g, "");

    if (normalizedType === "2j") {
      return "border-cyan-300/20 bg-cyan-400/10 text-cyan-100";
    }

    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#e1e3e4]">
          Aperçu des repos générés
        </h2>
      </div>
      {dates.length === 0 ? (
        <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
          Aucun repos retourné.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#e1e3e4]">
                  {stat.value}
                </p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {dates.map((date) => {
              const reposForDate = rowsByDate[date];
              const progressWidth = `${Math.round(
                (reposForDate.length / maxReposCount) * 100
              )}%`;

              return (
                <section
                  key={date}
                  className="rounded border border-[rgba(172,189,197,0.15)] bg-[#38474e]"
                >
                  <div className="border-b border-[rgba(172,189,197,0.15)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-[#e1e3e4]">
                        {date}
                      </h3>
                      <span className="rounded border border-[rgba(26,182,255,0.22)] bg-[#1AB6FF]/10 px-2.5 py-1 text-xs font-semibold text-[#bdeaff]">
                        {reposForDate.length} repos
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded bg-[#334149]">
                      <div
                        className="h-full rounded bg-[#1AB6FF]"
                        style={{ width: progressWidth }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    {reposForDate.map((row, index) => {
                      const reposType = getReposType(row);

                      return (
                        <article
                          key={row.id || `${date}-${index}`}
                          className="rounded border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="min-w-0 text-sm font-semibold text-[#e1e3e4]">
                              {getEmployeeName(row) || "Employé non défini"}
                            </h4>
                            <span
                              className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${getReposTypeBadgeClass(
                                reposType
                              )}`}
                            >
                              {reposType}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#acbdc5]">
                            Type: {reposType}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default function AdminPlanningPage() {
  const router = useRouter();
  const fetchRequestId = useRef(0);
  const [startDate, setStartDate] = useState(getCurrentWeekMonday);
  const [overwrite, setOverwrite] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingExisting, setIsFetchingExisting] = useState(false);
  const [hasFetchedExistingWeek, setHasFetchedExistingWeek] = useState(false);
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
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    if (calculatedWeekNumber === null) {
      setResult(null);
      setHasFetchedExistingWeek(false);
      setIsFetchingExisting(false);
      return;
    }

    const requestId = fetchRequestId.current + 1;
    fetchRequestId.current = requestId;

    setIsFetchingExisting(true);
    setHasFetchedExistingWeek(false);
    setResult(null);
    setSuccessMessage("");
    setErrorMessage("");
    setBackendErrors([]);

    fetchExistingWeekPlanning(startDate, token, calculatedWeekNumber)
      .then((existingResult) => {
        if (fetchRequestId.current !== requestId) {
          return;
        }

        setResult(existingResult);
        setHasFetchedExistingWeek(true);
      })
      .catch(() => {
        if (fetchRequestId.current !== requestId) {
          return;
        }

        setResult(null);
        setHasFetchedExistingWeek(false);
        setErrorMessage("Impossible de charger le planning de la semaine.");
      })
      .finally(() => {
        if (fetchRequestId.current !== requestId) {
          return;
        }

        setIsFetchingExisting(false);
      });
  }, [calculatedWeekNumber, router, startDate]);

  function getSelectedWeek() {
    const weekDays = getWeekDatesFromStart(startDate);

    return {
      startDate,
      endDate: weekDays[6] || startDate,
      weekNumber: calculatedWeekNumber || undefined,
    };
  }

  function renderEmptyWeekState() {
    return (
      <section className="rounded border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5">
        <h2 className="text-base font-semibold text-[#e1e3e4]">
          Aucun planning trouvé pour cette semaine.
        </h2>
        <p className="mt-1 text-sm text-[#acbdc5]">
          Vous pouvez générer le planning avec le bouton ci-dessus.
        </p>
      </section>
    );
  }

  function renderExistingWeekLoading() {
    return (
      <section className="rounded border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm font-semibold text-[#acbdc5]">
        Chargement du planning de la semaine...
      </section>
    );
  }

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

    fetchRequestId.current += 1;
    setIsLoading(true);
    setIsFetchingExisting(false);
    setHasFetchedExistingWeek(false);
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

      setResult({
        ...data,
        week: data.week || getSelectedWeek(),
      });
      setHasFetchedExistingWeek(true);
      setSuccessMessage("Planning généré avec succès.");
    } catch {
      setErrorMessage("Impossible de contacter le serveur backend.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#4c595f] text-[#e1e3e4]">
      <AdminNavbar onLogout={handleLogout} />

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
          className="mb-6 rounded border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 shadow-[0_16px_40px_rgba(17,24,28,0.14)] sm:p-5"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-[#acbdc5]">
                <span className="mb-2 block text-xs uppercase tracking-wide">
                  Date de début
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-11 w-full rounded border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-sm font-semibold text-[#e1e3e4] outline-none transition placeholder:text-[#acbdc5] focus:border-[#1AB6FF] focus:ring-2 focus:ring-[#1AB6FF]/20"
                  required
                />
                <span className="mt-2 block text-xs font-normal text-[#acbdc5]">
                  La date doit être un lundi.
                </span>
                {startDateValidationMessage ? (
                  <span className="mt-1 block text-xs font-semibold text-red-100">
                    {startDateValidationMessage}
                  </span>
                ) : null}
              </label>

              <label className="flex items-start gap-3 rounded border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3 text-sm font-semibold text-[#e1e3e4]">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1AB6FF]"
                />
                <span className="leading-5">
                  Remplacer le planning existant pour cette semaine
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded border border-[rgba(172,189,197,0.15)] border-l-[#1AB6FF] bg-[#334149] px-4 py-4 lg:flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                  Semaine calculée automatiquement
                </p>
                <p className="mt-3 text-2xl font-semibold text-[#e1e3e4]">
                  {calculatedWeekNumber ? `Semaine ${calculatedWeekNumber}` : "-"}
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || calculatedWeekNumber === null}
                className="h-11 rounded bg-[#1AB6FF] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(26,182,255,0.18)] transition hover:bg-[#169CDC] focus:outline-none focus:ring-2 focus:ring-[#1AB6FF]/35 focus:ring-offset-2 focus:ring-offset-[#38474e] disabled:cursor-not-allowed disabled:bg-[#169CDC] disabled:opacity-70"
              >
                {isLoading ? "Génération..." : "Générer planning"}
              </button>
            </div>
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

          {isFetchingExisting ? renderExistingWeekLoading() : null}

          {!isFetchingExisting &&
          hasFetchedExistingWeek &&
          (!result || planningRows.length === 0)
            ? renderEmptyWeekState()
            : null}

          {!isFetchingExisting && result && planningRows.length > 0 ? (
            <>
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
