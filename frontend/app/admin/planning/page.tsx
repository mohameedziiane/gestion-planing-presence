"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AdminNavbar from "@/components/AdminNavbar";
import { API_BASE_URL, translateUserMessage, translateUserMessages } from "@/lib/api";

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
  transferEvents?: TransferEvent[];
  transferMarkers?: TransferEvent[];
  warnings?: string[];
  errors?: string[];
};
type TransferEvent = {
  employe_id?: number | string;
  employeeId?: number | string;
  employeeName?: string;
  prenom?: string;
  nom?: string;
  groupe?: string;
  groupName?: string;
  date?: string;
  fromPeriodName?: string;
  source_period?: string;
  toPeriodName?: string;
  target_period?: string;
  display_status?: string;
  label?: string;
};
type CellState = {
  label: string;
  title?: string;
  variant?: "cross-shift-transfer" | "transfer-marker";
};
type PlanningEmployee = {
  key: string;
  name: string;
  group: string;
};

const PLANNING_WEEK_ANCHOR_DATE = "2026-04-27";
const OFFICIAL_GROUP_ORDER = ["groupe a", "groupe b"];
const OFFICIAL_EMPLOYEE_ORDER_BY_GROUP: Record<string, string[]> = {
  "groupe a": [
    "fatiha almou",
    "hayat el aroussi",
    "moncef el amri",
    "ayoub lahlali",
    "youness belhouari",
    "younes belhouari",
  ],
  "groupe b": [
    "abire alaoui",
    "rahma latrache",
    "said nacer",
    "saber aboabdallah",
    "tahra ghaya",
  ],
};
const FIXED_CONTROL_PERIOD_BY_EMPLOYEE: Record<string, "Matin" | "Soir"> = {
  "moncef el amri": "Matin",
  "said nacer": "Soir",
};

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

function getOfficialGroupRank(groupName?: string) {
  const normalizedGroup = normalizeText(groupName);
  const groupRank = OFFICIAL_GROUP_ORDER.indexOf(normalizedGroup);

  return groupRank === -1 ? Number.MAX_SAFE_INTEGER : groupRank;
}

function getOfficialEmployeeRank(employee: { name: string; group?: string }) {
  const normalizedGroup = normalizeText(employee.group);
  const normalizedName = normalizeText(employee.name);
  const groupOrder = OFFICIAL_EMPLOYEE_ORDER_BY_GROUP[normalizedGroup] || [];
  const employeeRank = groupOrder.indexOf(normalizedName);

  return employeeRank === -1 ? Number.MAX_SAFE_INTEGER : employeeRank;
}

function sortEmployeesByOfficialGroupOrder<T extends { name: string; group?: string }>(
  employees: T[]
) {
  return [...employees].sort((a, b) => {
    const groupRankDiff = getOfficialGroupRank(a.group) - getOfficialGroupRank(b.group);

    if (groupRankDiff !== 0) {
      return groupRankDiff;
    }

    const employeeRankDiff = getOfficialEmployeeRank(a) - getOfficialEmployeeRank(b);

    if (employeeRankDiff !== 0) {
      return employeeRankDiff;
    }

    const groupComparison = String(a.group || "").localeCompare(
      String(b.group || ""),
      "fr"
    );

    if (groupComparison !== 0) {
      return groupComparison;
    }

    return a.name.localeCompare(b.name, "fr");
  });
}

function sortSectionEmployeesWithControlInMiddle<T extends PlanningEmployee>(
  employees: T[],
  controlEmployeeKeys: Set<string>
) {
  const sortedEmployees = sortEmployeesByOfficialGroupOrder(employees);
  const controlEmployees = sortedEmployees.filter((employee) =>
    controlEmployeeKeys.has(employee.key)
  );

  if (controlEmployees.length === 0) {
    return sortedEmployees;
  }

  const nonControlEmployees = sortedEmployees.filter(
    (employee) => !controlEmployeeKeys.has(employee.key)
  );
  const middleIndex = Math.floor(nonControlEmployees.length / 2);

  return [
    ...nonControlEmployees.slice(0, middleIndex),
    ...controlEmployees,
    ...nonControlEmployees.slice(middleIndex),
  ];
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

function getDisplayRole(row: ApiRow) {
  return getString(row, ["display_role"]);
}

function getDisplayStatus(row: ApiRow) {
  return getString(row, ["display_status"]);
}

function getTransferType(row: ApiRow) {
  return getString(row, ["transfer_type"]);
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

function getTransferEmployeeKey(event: TransferEvent) {
  const idValue = event.employeeId || event.employe_id;

  if (typeof idValue === "number" || typeof idValue === "string") {
    const normalizedId = String(idValue).trim();

    if (normalizedId) {
      return `id:${normalizedId}`;
    }
  }

  const employeeName =
    event.employeeName ||
    [event.prenom, event.nom].filter(Boolean).join(" ").trim();

  return employeeName ? `name:${normalizeText(employeeName)}` : "";
}

function getTransferEmployeeName(event: TransferEvent) {
  return (
    event.employeeName ||
    [event.prenom, event.nom].filter(Boolean).join(" ").trim()
  );
}

function getReposType(row: ApiRow) {
  return getString(row, ["type", "repos_type"]) || "Repos";
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

function getDownloadFilename(headerValue: string | null, fallback: string) {
  if (!headerValue) {
    return fallback;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = /filename="?([^"]+)"?/i.exec(headerValue);

  return simpleMatch?.[1] || fallback;
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

function normalizeRoleToken(value: string) {
  return normalizeText(value)
    .replace(/ãƒâ´/g, "o")
    .replace(/ã´/g, "o")
    .replace(/[\s/+]+/g, "");
}

function isForbiddenRoleLabel(value: string) {
  const normalizedValue = normalizeText(value);
  const compactRole = normalizeRoleToken(value);

  return (
    normalizedValue.includes("+") ||
    normalizedValue.includes("/") ||
    compactRole.includes("caisse") ||
    compactRole === "guichetcontrole" ||
    compactRole === "controleguichet"
  );
}

function normalizeAllowedRoleLabel(value: string) {
  const compactRole = normalizeRoleToken(value);

  if (compactRole === "guichet") {
    return "Guichet";
  }

  if (compactRole === "controle" || compactRole.startsWith("contr")) {
    return "Contr\u00f4le";
  }

  if (compactRole === "repos") {
    return "Repos";
  }

  if (compactRole === "nuit") {
    return "Nuit";
  }

  return "";
}

function isCrossShiftTransferredInRow(row: ApiRow) {
  const transferType = normalizeText(getTransferType(row));
  const displayStatus = normalizeText(getDisplayStatus(row));
  const sourcePeriod = normalizeText(getString(row, ["source_period"]));
  const targetPeriod = normalizeText(getString(row, ["target_period"]));

  return (
    transferType === "cross_shift_control" ||
    (displayStatus === "replacement_control" &&
      Boolean(sourcePeriod) &&
      Boolean(targetPeriod) &&
      sourcePeriod !== targetPeriod)
  );
}

function getRoleStatus(row: ApiRow): CellState {
  const displayRole = getDisplayRole(row);
  const role = getRoleName(row);
  const rawLabel = displayRole || role;

  if (!rawLabel || normalizeText(rawLabel).includes("non defini")) {
    return { label: "" };
  }

  if (
    (displayRole && isForbiddenRoleLabel(displayRole)) ||
    isForbiddenRoleLabel(role)
  ) {
    return {
      label: "Conflit",
      title: `Libell\u00e9 invalide: ${rawLabel}`,
    };
  }

  const allowedLabel = normalizeAllowedRoleLabel(rawLabel);

  if (!allowedLabel) {
    return {
      label: "Conflit",
      title: `Libell\u00e9 inconnu: ${rawLabel}`,
    };
  }

  if (
    normalizeRoleToken(allowedLabel).startsWith("contr") &&
    isCrossShiftTransferredInRow(row)
  ) {
    return {
      label: allowedLabel,
      variant: "cross-shift-transfer",
    };
  }

  return { label: allowedLabel };
}

function roleListTitle(rows: ApiRow[]) {
  return rows
    .map((row) => {
      const status = getRoleStatus(row);
      const rawLabel = getDisplayRole(row) || getRoleName(row);

      return `${getEmployeeName(row) || "Employ\u00e9"}: ${
        status.label || "Conflit"
      }${status.title ? ` (${rawLabel})` : ""}`;
    })
    .join(" | ");
}

function getCellClass(
  status: string,
  shift?: "Matin" | "Soir" | "Nuit",
  variant?: CellState["variant"]
) {
  const normalized = normalizeText(status);
  const roleToken = normalizeRoleToken(status);

  if (
    variant === "cross-shift-transfer" ||
    variant === "transfer-marker" ||
    normalized === "transfere"
  ) {
    return "border-emerald-500 bg-emerald-50 font-bold text-emerald-800";
  }

  if (normalized === "repos") {
    return "border-[var(--color-planning-repos-border)] bg-[var(--color-planning-repos-bg)] text-[var(--color-planning-repos-text)]";
  }

  if (normalized.includes("conflit")) {
    return "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]";
  }

  if (normalized.includes("manquante")) {
    return "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]";
  }

  if ((shift === "Nuit" && normalized) || roleToken === "nuit") {
    return "border-[var(--color-planning-night-border)] bg-[var(--color-planning-night-bg)] text-[var(--color-planning-night-text)]";
  }

  if (roleToken === "controle" || roleToken.startsWith("contr")) {
    return "border-amber-400 bg-amber-100 font-bold text-amber-900";
  }

  if (!normalized || normalized === "-") {
    return "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  }

  return "border-[var(--color-border)] bg-[var(--color-planning-normal-bg)] text-[var(--color-planning-normal-text)]";
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

function isAdminVisibleWarning(message: string) {
  const normalizedMessage = normalizeText(message);
  const compactMessage = normalizeRoleToken(message);

  if (!normalizedMessage) {
    return false;
  }

  if (
    normalizedMessage.includes("aucun controle disponible") ||
    compactMessage.includes("aucuncontroledisponible") ||
    (normalizedMessage.includes("contient seulement") &&
      normalizedMessage.includes("employe")) ||
    (compactMessage.includes("contientseulement") &&
      compactMessage.includes("employe")) ||
    normalizedMessage.includes("conflit") ||
    compactMessage.includes("conflit") ||
    normalizedMessage.includes("erreur") ||
    compactMessage.includes("erreur") ||
    normalizedMessage.includes("invalide")
  ) {
    return true;
  }

  return false;
}

function getAdminVisibleWarnings(warnings: string[]) {
  return warnings.filter(isAdminVisibleWarning);
}

function Alert({
  tone,
  children,
}: {
  tone: "success" | "error" | "warning";
  children: React.ReactNode;
}) {
  const classes = {
    success:
      "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
    error:
      "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
    warning:
      "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  };

  return <div className={`border px-4 py-3 text-sm ${classes[tone]}`}>{children}</div>;
}

function WeeklyPlanningPreview({
  planningRows,
  reposRows,
  transferEvents,
  week,
}: {
  planningRows: ApiRow[];
  reposRows: ApiRow[];
  transferEvents: TransferEvent[];
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
  const planningByEmployeeDate = new Map<string, ApiRow[]>();
  const reposByEmployeeDate = new Map<string, ApiRow>();
  const nightByEmployeeDate = new Map<string, ApiRow[]>();
  const nightByDate = new Map<string, ApiRow[]>();
  const employeeDirectory = new Map<string, PlanningEmployee>();
  const transferMarkersByEmployeeDatePeriod = new Map<string, TransferEvent>();

  planningRows.forEach((row) => {
    const employeeKey = getEmployeeKey(row);
    const date = getNormalizedDate(row);
    const shift = normalizeText(getShiftName(row));
    const name = getEmployeeName(row);
    const group = getGroupName(row);

    if (!employeeKey || !date || !name) {
      return;
    }

    employeeDirectory.set(employeeKey, { key: employeeKey, name, group });
    const planningKey = `${employeeKey}|${date}|${shift}`;
    const planningRowsForKey = planningByEmployeeDate.get(planningKey) || [];

    planningRowsForKey.push(row);
    planningByEmployeeDate.set(planningKey, planningRowsForKey);

    if (shift === "nuit") {
      const nightEmployeeKey = `${employeeKey}|${date}`;
      const nightEmployeeRows = nightByEmployeeDate.get(nightEmployeeKey) || [];
      const nightDateRows = nightByDate.get(date) || [];

      nightEmployeeRows.push(row);
      nightDateRows.push(row);
      nightByEmployeeDate.set(nightEmployeeKey, nightEmployeeRows);
      nightByDate.set(date, nightDateRows);
    }
  });

  reposRows.forEach((row) => {
    const employeeKey = getEmployeeKey(row);
    const date = getNormalizedDate(row);
    const name = getEmployeeName(row);
    const group = getGroupName(row);

    if (!employeeKey || !date || !name) {
      return;
    }

    employeeDirectory.set(employeeKey, { key: employeeKey, name, group });
    reposByEmployeeDate.set(`${employeeKey}|${date}`, row);
  });

  transferEvents.forEach((event) => {
    const employeeKey = getTransferEmployeeKey(event);
    const date = normalizeDateValue(event.date);
    const sourcePeriod = event.source_period || event.fromPeriodName;
    const employeeName = getTransferEmployeeName(event);
    const group = event.groupe || event.groupName || "";

    if (!employeeKey || !date || !sourcePeriod || !employeeName) {
      return;
    }

    employeeDirectory.set(employeeKey, {
      key: employeeKey,
      name: employeeName,
      group,
    });
    transferMarkersByEmployeeDatePeriod.set(
      `${employeeKey}|${date}|${normalizeText(sourcePeriod)}`,
      event
    );
  });

  function getSectionEmployees(shift: "Matin" | "Soir") {
    const normalizedShift = normalizeText(shift);
    const employeesByKey = new Map<string, PlanningEmployee>();
    const controlRowCountsByEmployeeKey = new Map<string, number>();
    const transferredInEmployeeKeys = new Set<string>();
    const groupsWithNonControlRows = new Set<string>();

    planningRows.forEach((row) => {
      if (normalizeText(getShiftName(row)) !== normalizedShift) {
        return;
      }

      const employeeKey = getEmployeeKey(row);
      const employee = employeeKey ? employeeDirectory.get(employeeKey) : null;

      if (employee) {
        employeesByKey.set(employeeKey, employee);

        if (isCrossShiftTransferredInRow(row)) {
          transferredInEmployeeKeys.add(employeeKey);
        }

        if (normalizeText(getRoleStatus(row).label) === "controle") {
          controlRowCountsByEmployeeKey.set(
            employeeKey,
            (controlRowCountsByEmployeeKey.get(employeeKey) || 0) + 1
          );
        } else {
          groupsWithNonControlRows.add(normalizeText(employee.group));
        }
      }
    });

    transferEvents.forEach((event) => {
      const sourcePeriod = event.source_period || event.fromPeriodName;

      if (normalizeText(sourcePeriod) !== normalizedShift) {
        return;
      }

      const employeeKey = getTransferEmployeeKey(event);
      const employee = employeeKey ? employeeDirectory.get(employeeKey) : null;

      if (employee) {
        employeesByKey.set(employeeKey, employee);
        groupsWithNonControlRows.add(normalizeText(employee.group));
      }
    });

    employeeDirectory.forEach((employee) => {
      const normalizedGroup = normalizeText(employee.group);
      const normalizedName = normalizeText(employee.name);
      const officialGroupOrder = OFFICIAL_EMPLOYEE_ORDER_BY_GROUP[normalizedGroup];
      const fixedControlPeriod = FIXED_CONTROL_PERIOD_BY_EMPLOYEE[normalizedName];

      if (
        employeesByKey.has(employee.key) ||
        !groupsWithNonControlRows.has(normalizedGroup) ||
        !officialGroupOrder?.includes(normalizedName) ||
        (fixedControlPeriod && fixedControlPeriod !== shift)
      ) {
        return;
      }

      const hasReposOrNightInWeek = weekDays.some((date) => {
        const employeeDateKey = `${employee.key}|${date}`;

        return (
          reposByEmployeeDate.has(employeeDateKey) ||
          (nightByEmployeeDate.get(employeeDateKey) || []).length > 0
        );
      });

      if (hasReposOrNightInWeek) {
        employeesByKey.set(employee.key, employee);
      }
    });

    const controlEmployees = sortEmployeesByOfficialGroupOrder(
      Array.from(controlRowCountsByEmployeeKey.keys())
        .map((employeeKey) => employeesByKey.get(employeeKey))
        .filter((employee): employee is PlanningEmployee => Boolean(employee))
    );
    const fixedControlEmployee = controlEmployees.find(
      (employee) =>
        FIXED_CONTROL_PERIOD_BY_EMPLOYEE[normalizeText(employee.name)] === shift
    );
    const primaryControlEmployee =
      fixedControlEmployee ||
      controlEmployees
        .map((employee) => ({
          employee,
          total: controlRowCountsByEmployeeKey.get(employee.key) || 0,
        }))
        .sort((a, b) => b.total - a.total)[0]?.employee;
    const primaryControlEmployeeKeys = new Set(
      primaryControlEmployee ? [primaryControlEmployee.key] : []
    );
    const normalEmployees = Array.from(employeesByKey.values()).filter(
      (employee) => !transferredInEmployeeKeys.has(employee.key)
    );
    const transferredInEmployees = sortEmployeesByOfficialGroupOrder(
      Array.from(transferredInEmployeeKeys)
        .map((employeeKey) => employeesByKey.get(employeeKey))
        .filter((employee): employee is PlanningEmployee => Boolean(employee))
    );

    return [
      ...sortSectionEmployeesWithControlInMiddle(
        normalEmployees,
        primaryControlEmployeeKeys
      ),
      ...transferredInEmployees,
    ];
  }

  function getDayShiftCell(
    employeeKey: string,
    date: string,
    shift: "Matin" | "Soir"
  ): CellState {
    const employeeDateKey = `${employeeKey}|${date}`;
    const planningKey = `${employeeDateKey}|${normalizeText(shift)}`;

    if (reposByEmployeeDate.has(employeeDateKey)) {
      return { label: "REPOS" };
    }

    const planningRowsForKey = planningByEmployeeDate.get(planningKey) || [];

    if (planningRowsForKey.length > 1) {
      return {
        label: "Conflit",
        title: roleListTitle(planningRowsForKey),
      };
    }

    if (planningRowsForKey.length === 1) {
      return getRoleStatus(planningRowsForKey[0]);
    }

    const nightRowsForEmployee = nightByEmployeeDate.get(employeeDateKey) || [];

    if (nightRowsForEmployee.length > 0) {
      const invalidNightRow = nightRowsForEmployee
        .map(getRoleStatus)
        .find((status) => status.label === "Conflit");

      if (invalidNightRow) {
        return {
          label: "Conflit",
          title: invalidNightRow.title,
        };
      }

      return {
        label: "Nuit",
        title: roleListTitle(nightRowsForEmployee),
      };
    }

    const transferMarker = transferMarkersByEmployeeDatePeriod.get(planningKey);

    if (transferMarker) {
      const targetPeriod =
        transferMarker.target_period || transferMarker.toPeriodName || "";

      return {
        label: "Transf\u00e9r\u00e9",
        title: targetPeriod
          ? `Transf\u00e9r\u00e9 vers ${targetPeriod} pour Contr\u00f4le`
          : "Transf\u00e9r\u00e9 pour Contr\u00f4le",
        variant: "transfer-marker",
      };
    }

    return { label: "" };
  }

  function renderEmployeeSection(
    title: "Matin" | "Soir" | "Nuit",
    employees: PlanningEmployee[],
    getCellStatus: (employeeKey: string, date: string) => CellState
  ) {
    const showGroupName = title !== "Nuit";

    return (
      <>
        <tr className="bg-[var(--color-surface-muted)]">
          <th
            colSpan={8}
            className="border border-[var(--color-border)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-[var(--color-accent)]"
          >
            {title.toUpperCase()}
          </th>
        </tr>
        {employees.length === 0 ? (
          <tr>
            <td
              colSpan={8}
              className="border border-[var(--color-border)] px-4 py-4 text-sm text-[var(--color-text-muted)]"
            >
              Aucune ligne.
            </td>
          </tr>
        ) : (
          employees.map((employee) => (
            <tr key={`${title}-${employee.name}`}>
              <th className="min-w-56 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-left align-top">
                <span className="block text-sm font-semibold text-[var(--color-text)]">
                  {employee.name}
                </span>
                {showGroupName ? (
                  <span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">
                    {employee.group}
                  </span>
                ) : null}
              </th>
              {weekDays.map((date) => {
                const status = getCellStatus(employee.key, date);

                return (
                  <td
                    key={`${employee.name}-${date}`}
                    title={status.title}
                    className={`min-w-32 border px-3 py-3 text-center text-xs font-semibold ${getCellClass(
                      status.label,
                      title,
                      status.variant
                    )}`}
                  >
                    {status.label}
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
        <h2 className="text-xl font-semibold text-[var(--color-text)]">
          Aperçu du planning généré
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Vue hebdomadaire par employé et par jour
        </p>
      </div>

      {weekDays.length === 0 ? (
        <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
          Aucun planning retourné.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-muted)]">
                <th className="border border-[var(--color-border)] px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  TAZA GARE ROUTIERE
                </th>
                {weekDays.map((date, index) => (
                  <th
                    key={date}
                    className="border border-[var(--color-border)] px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]"
                  >
                    <span className="block text-[var(--color-text)]">{dayLabels[index]}</span>
                    <span className="mt-1 block font-normal normal-case text-[var(--color-text-muted)]">
                      {date}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderEmployeeSection(
                "Matin",
                getSectionEmployees("Matin"),
                (employeeKey, date) => getDayShiftCell(employeeKey, date, "Matin")
              )}
              {renderEmployeeSection(
                "Soir",
                getSectionEmployees("Soir"),
                (employeeKey, date) => getDayShiftCell(employeeKey, date, "Soir")
              )}
              <tr className="bg-[var(--color-surface-muted)]">
                <th
                  colSpan={8}
                  className="border border-[var(--color-border)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-[var(--color-accent)]"
                >
                  NUIT
                </th>
              </tr>
              <tr>
                <th className="min-w-56 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text)]">
                  Employé Nuit
                </th>
                {weekDays.map((date) => {
                  const nightRowsForDate = nightByDate.get(date) || [];
                  const singleNightStatus =
                    nightRowsForDate.length === 1
                      ? getRoleStatus(nightRowsForDate[0])
                      : null;
                  const status: CellState =
                    nightRowsForDate.length === 0
                      ? {
                          label: "Nuit manquante",
                        }
                      : nightRowsForDate.length > 1
                        ? {
                            label: "Conflit Nuit",
                            title: roleListTitle(nightRowsForDate),
                          }
                        : singleNightStatus?.label === "Conflit"
                          ? {
                              label: "Conflit Nuit",
                              title: singleNightStatus.title,
                            }
                          : {
                            label:
                              getEmployeeName(nightRowsForDate[0]) ||
                              "Employ\u00e9 non d\u00e9fini",
                            title: "Nuit",
                          };
                  return (
                    <td
                      key={`night-${date}`}
                      title={status.title}
                      className={`min-w-32 border px-3 py-3 text-center text-xs font-semibold ${getCellClass(
                        status.label,
                        "Nuit",
                        status.variant
                      )}`}
                    >
                      {status.label}
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
      return "border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] text-[var(--color-badge-text)]";
    }

    return "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]";
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text)]">
          Aperçu des repos générés
        </h2>
      </div>
      {dates.length === 0 ? (
        <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
          Aucun repos retourné.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
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
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <div className="border-b border-[var(--color-border)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-[var(--color-text)]">
                        {date}
                      </h3>
                      <span className="rounded border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--color-badge-text)]">
                        {reposForDate.length} repos
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded bg-[var(--color-surface-muted)]">
                      <div
                        className="h-full rounded bg-[var(--color-accent)]"
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
                          className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="min-w-0 text-sm font-semibold text-[var(--color-text)]">
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
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
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
  const [startDate, setStartDate] = useState(getCurrentWeekMonday);
  const overwrite = true;
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendErrors, setBackendErrors] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const planningRows = result?.planning || [];
  const reposRows = result?.repos || [];
  const warnings = result?.warnings || [];
  const adminVisibleWarnings = getAdminVisibleWarnings(warnings);
  const showReposPreview = false;
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
    }
  }, [router]);

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
      <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Aucun planning trouvé pour cette semaine.
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Vous pouvez générer le planning avec le bouton ci-dessus.
        </p>
      </section>
    );
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
    router.push("/");
  }

  async function handleExportExcel() {
    if (calculatedWeekNumber === null) {
      setErrorMessage(startDateValidationMessage);
      setBackendErrors([]);
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    const endDate = addDays(startDate, 6) || startDate;

    setIsExportingExcel(true);
    setErrorMessage("");
    setBackendErrors([]);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/exports/planning/excel?startDate=${encodeURIComponent(
          startDate
        )}&endDate=${encodeURIComponent(endDate)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const text = await response.text();
        let message = "Impossible d'exporter le fichier Excel.";

        if (text) {
          try {
            const payload = JSON.parse(text) as { message?: string };

            if (payload.message) {
              message = translateUserMessage(payload.message);
            }
          } catch {
            message = translateUserMessage(text);
          }
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = getDownloadFilename(
        response.headers.get("Content-Disposition"),
        `planning-${startDate}-to-${endDate}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'exporter le fichier Excel."
      );
    } finally {
      setIsExportingExcel(false);
    }
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
        `${API_BASE_URL}/api/planning-generation/week`,
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
        setErrorMessage(
          translateUserMessage(data.message || "Impossible de générer le planning.")
        );
        setBackendErrors(
          Array.isArray(data.errors) ? translateUserMessages(data.errors) : []
        );
        return;
      }

      setResult({
        ...data,
        week: data.week || getSelectedWeek(),
      });
      setSuccessMessage("Planning généré avec succès.");
    } catch {
      setErrorMessage("Impossible de contacter le serveur backend.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Gestion du planning
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Générer le planning hebdomadaire des employés
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_16px_40px_rgba(17,24,28,0.14)] sm:p-5"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="mb-2 block text-xs uppercase tracking-wide">
                  Date de début
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-11 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm font-semibold text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  required
                />
                <span className="mt-2 block text-xs font-normal text-[var(--color-text-muted)]">
                  La date doit être un lundi.
                </span>
                {startDateValidationMessage ? (
                  <span className="mt-1 block text-xs font-semibold text-[var(--color-danger-inline-text)]">
                    {startDateValidationMessage}
                  </span>
                ) : null}
              </label>

            </div>

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={isLoading || isExportingExcel || calculatedWeekNumber === null}
                className="h-11 rounded bg-[var(--color-accent)] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(26,182,255,0.18)] transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-hover)] disabled:opacity-70"
              >
                {isLoading ? "Génération..." : "Générer planning"}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isLoading || isExportingExcel || calculatedWeekNumber === null}
                className="h-11 rounded border border-emerald-700 bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:bg-emerald-700 disabled:opacity-70"
              >
                {isExportingExcel ? "Export Excel..." : "Exporter Excel"}
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

          {adminVisibleWarnings.length > 0 ? (
            <Alert tone="warning">
              <p className="font-semibold">Avertissements</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {adminVisibleWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {result && planningRows.length === 0 ? renderEmptyWeekState() : null}

          {result && planningRows.length > 0 ? (
            <>
              <WeeklyPlanningPreview
                planningRows={planningRows}
                reposRows={reposRows}
                transferEvents={[
                  ...(result.transferMarkers || []),
                  ...(result.transferEvents || []),
                ]}
                week={result.week}
              />
              {showReposPreview ? <ReposPreview rows={reposRows} /> : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
