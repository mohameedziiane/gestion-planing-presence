const ExcelJS = require("exceljs");

const db = require("../config/db");

const FRENCH_WEEKDAY_LABELS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
const EXCEL_NIGHT_FILL = "FFFCA5A5";
const EXCEL_NIGHT_TEXT = "FF7F1D1D";
const MATIN_GROUPE_A_ORDER = ["FATIHA", "HAYAT", "MONCEF", "AYOUB", "YOUNESS"];
const SOIR_GROUPE_B_ORDER = ["ABIRE", "RAHMA", "SAID", "SABER", "TAHRA"];
const MATIN_GROUPE_B_ORDER = ["ABIRE", "RAHMA", "MONCEF", "SABER", "TAHRA"];
const SOIR_GROUPE_A_ORDER = ["FATIHA", "HAYAT", "SAID", "AYOUB", "YOUNESS"];
const GROUPE_A_MARKERS = ["FATIHA", "HAYAT", "AYOUB", "YOUNESS"];
const GROUPE_B_MARKERS = ["ABIRE", "RAHMA", "SABER", "TAHRA"];
const FIXED_CONTROL_PERIOD_BY_FIRST_NAME = {
  MONCEF: "MATIN",
  SAID: "SOIR",
};

function parseUtcDate(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, daysToAdd) {
  const date = parseUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + daysToAdd);

  return formatUtcDate(date);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    dates.push(currentDate);
    currentDate = addDays(currentDate, 1);
  }

  return dates;
}

function getDayColumnLabel(dateString) {
  const date = parseUtcDate(dateString);
  const weekday = FRENCH_WEEKDAY_LABELS[date.getUTCDay()] || dateString;

  return `${weekday} ${dateString}`;
}

function getPlanningEmployeeKey(row) {
  if (row.employe_id !== undefined && row.employe_id !== null) {
    return `id:${row.employe_id}`;
  }

  return `name:${normalizeText(row.full_name)}`;
}

function getShiftKey(shiftName) {
  const normalizedShift = normalizeText(shiftName);

  if (normalizedShift === "MATIN") {
    return "MATIN";
  }

  if (normalizedShift === "SOIR") {
    return "SOIR";
  }

  if (normalizedShift === "NUIT") {
    return "NUIT";
  }

  return "";
}

function getRoleLabel(roleName, shiftName = "") {
  const normalizedRole = normalizeText(roleName);
  const shiftKey = getShiftKey(shiftName);
  const compactRole = normalizedRole
    .replace(/\+/g, "/")
    .replace(/\s+/g, "");

  if (!normalizedRole) {
    return "-";
  }

  if (
    normalizedRole.includes("+") ||
    normalizedRole.includes("/") ||
    compactRole.includes("CAISSE") ||
    compactRole === "GUICHETCONTROLE" ||
    compactRole === "CONTROLEGUICHET"
  ) {
    return "CONFLIT";
  }

  if (shiftKey === "NUIT") {
    return normalizedRole === "GUICHET" ? "NUIT" : "CONFLIT";
  }

  if (normalizedRole === "GUICHET") {
    return "GUICHET";
  }

  if (normalizedRole === "CAISSE") {
    return "CONFLIT";
  }

  if (normalizedRole.startsWith("CONTROLE")) {
    return "CONTRÔLE";
  }

  return String(roleName).trim().toUpperCase();
}

function getNormalizedFirstName(name) {
  return normalizeText(name).split(/\s+/)[0] || "";
}

function getFixedControlPeriod(employee) {
  return FIXED_CONTROL_PERIOD_BY_FIRST_NAME[
    getNormalizedFirstName(employee.full_name)
  ] || "";
}

function belongsToSection(employee, sectionKey) {
  const fixedControlPeriod = getFixedControlPeriod(employee);

  return !fixedControlPeriod || fixedControlPeriod === sectionKey;
}

function hasAnyEmployee(employees, preferredNames) {
  const employeeNames = employees.map((employee) =>
    getNormalizedFirstName(employee.full_name)
  );

  return preferredNames.some((name) => employeeNames.includes(name));
}

function getPreferredEmployeeOrder(sectionKey, employees) {
  if (sectionKey === "MATIN") {
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

function sortEmployees(rows, sectionKey) {
  const preferredOrder = getPreferredEmployeeOrder(sectionKey, rows);

  return [...rows].sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(
      getNormalizedFirstName(left.full_name)
    );
    const rightIndex = preferredOrder.indexOf(
      getNormalizedFirstName(right.full_name)
    );
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return String(left.full_name || "").localeCompare(
      String(right.full_name || ""),
      "fr"
    );
  });
}

function getTargetGroupName(employees) {
  const targetGroupEmployee =
    employees.find((employee) =>
      GROUPE_B_MARKERS.includes(getNormalizedFirstName(employee.full_name))
    ) ||
    employees.find((employee) =>
      GROUPE_A_MARKERS.includes(getNormalizedFirstName(employee.full_name))
    ) ||
    null;

  return targetGroupEmployee ? normalizeText(targetGroupEmployee.groupe) : "";
}

function addEmployeeToDirectory(employeeDirectory, row) {
  const employeeKey = getPlanningEmployeeKey(row);

  if (!employeeKey || employeeDirectory.has(employeeKey)) {
    return;
  }

  employeeDirectory.set(employeeKey, {
    key: employeeKey,
    full_name: row.full_name,
    groupe: row.groupe,
  });
}

async function fetchPlanningRows(startDate, endDate) {
  const [rows] = await db.query(
    `
      SELECT
        p.employe_id,
        CONCAT(e.prenom, ' ', e.nom) AS full_name,
        g.nom AS groupe,
        DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
        pt.nom AS periode_travail,
        rt.nom AS role_travail
      FROM planning p
      JOIN employes e ON e.id = p.employe_id
      JOIN groupes g ON g.id = e.groupe_id
      JOIN periodes_travail pt ON pt.id = p.periode_id
      JOIN roles_travail rt ON rt.id = p.role_travail_id
      WHERE p._date BETWEEN ? AND ?
      ORDER BY g.nom ASC, e.nom ASC, e.prenom ASC, p._date ASC, pt.nom ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

async function fetchReposRows(startDate, endDate) {
  const [rows] = await db.query(
    `
      SELECT
        r.employe_id,
        CONCAT(e.prenom, ' ', e.nom) AS full_name,
        g.nom AS groupe,
        DATE_FORMAT(r._date, '%Y-%m-%d') AS date,
        r.type
      FROM repos r
      JOIN employes e ON e.id = r.employe_id
      JOIN groupes g ON g.id = e.groupe_id
      WHERE r._date BETWEEN ? AND ?
      ORDER BY g.nom ASC, e.nom ASC, e.prenom ASC, r._date ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

function buildPlanningMaps(planningRows, reposRows) {
  const sectionEmployees = {
    MATIN: new Map(),
    SOIR: new Map(),
  };
  const planningBySectionEmployeeDate = new Map();
  const reposByEmployeeDate = new Set();
  const nightByEmployeeDate = new Set();
  const nightByDate = new Map();
  const employeeDirectory = new Map();

  planningRows.forEach((row) => {
    addEmployeeToDirectory(employeeDirectory, row);

    const employeeKey = getPlanningEmployeeKey(row);
    const shiftKey = getShiftKey(row.periode_travail);
    const date = String(row.date || "");

    if (!employeeKey || !shiftKey || !date) {
      return;
    }

    if (shiftKey === "MATIN" || shiftKey === "SOIR") {
      if (!sectionEmployees[shiftKey].has(employeeKey)) {
        sectionEmployees[shiftKey].set(employeeKey, {
          key: employeeKey,
          full_name: row.full_name,
          groupe: row.groupe,
        });
      }

      planningBySectionEmployeeDate.set(
        `${shiftKey}|${employeeKey}|${date}`,
        getRoleLabel(row.role_travail, row.periode_travail)
      );
    }

    if (shiftKey === "NUIT") {
      const nightLabel = getRoleLabel(row.role_travail, row.periode_travail);

      nightByEmployeeDate.add(`${employeeKey}|${date}|${nightLabel}`);

      if (!nightByDate.has(date)) {
        nightByDate.set(date, []);
      }

      nightByDate.get(date).push({
        full_name: row.full_name,
        groupe: row.groupe,
        label: nightLabel,
      });
    }
  });

  reposRows.forEach((row) => {
    addEmployeeToDirectory(employeeDirectory, row);

    const employeeKey = getPlanningEmployeeKey(row);
    const date = String(row.date || "");

    if (!employeeKey || !date) {
      return;
    }

    reposByEmployeeDate.add(`${employeeKey}|${date}`);
  });

  Object.keys(sectionEmployees).forEach((sectionKey) => {
    const sectionEmployeeList = Array.from(sectionEmployees[sectionKey].values());
    const targetGroupName = getTargetGroupName(sectionEmployeeList);

    if (!targetGroupName) {
      return;
    }

    employeeDirectory.forEach((employee) => {
      if (
        normalizeText(employee.groupe) === targetGroupName &&
        belongsToSection(employee, sectionKey)
      ) {
        sectionEmployees[sectionKey].set(employee.key, employee);
      }
    });
  });

  return {
    sectionEmployees: {
      MATIN: sortEmployees(Array.from(sectionEmployees.MATIN.values()), "MATIN"),
      SOIR: sortEmployees(Array.from(sectionEmployees.SOIR.values()), "SOIR"),
    },
    planningBySectionEmployeeDate,
    reposByEmployeeDate,
    nightByEmployeeDate,
    nightByDate,
  };
}

function applyWorksheetLayout(worksheet, totalColumns) {
  worksheet.mergeCells(1, 1, 1, totalColumns);
  worksheet.mergeCells(2, 1, 2, totalColumns);

  worksheet.getCell("A1").value = "Planning";
  worksheet.getCell("A1").font = { bold: true, size: 16 };
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getCell("A2").font = { italic: true, size: 11 };
  worksheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

  worksheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
}

function buildBorder(color) {
  return {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function styleHeaderRow(row) {
  row.height = 24;

  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4B99" },
    };
    cell.border = buildBorder("FFD1D5DB");
  });
}

function styleSectionRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1E3A5F" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF9" },
    };
    cell.border = buildBorder("FFD1D5DB");
  });
}

function applyRoleCellStyle(cell) {
  const normalizedValue = normalizeText(cell.value);

  if (normalizedValue === "REPOS") {
    cell.font = { bold: true, color: { argb: "FF1E3A5F" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE7F0FA" },
    };
    return;
  }

  if (normalizedValue === "NUIT") {
    cell.font = { bold: true, color: { argb: EXCEL_NIGHT_TEXT } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: EXCEL_NIGHT_FILL },
    };
    return;
  }

  if (
    normalizedValue.startsWith("CONTROLE") ||
    normalizedValue.startsWith("CONTR")
  ) {
    cell.font = { bold: true, color: { argb: "FF7C2D12" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
  }
}

function styleBodyRow(row) {
  row.eachCell((cell, columnNumber) => {
    cell.alignment = {
      horizontal: columnNumber === 1 ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = buildBorder("FFE5E7EB");

    if (columnNumber > 1) {
      applyRoleCellStyle(cell);
    }
  });
}

function styleNightAssignmentRow(row) {
  row.eachCell((cell, columnNumber) => {
    if (columnNumber === 1) {
      return;
    }

    if (normalizeText(cell.value) === "-") {
      return;
    }

    cell.font = { bold: true, color: { argb: EXCEL_NIGHT_TEXT } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: EXCEL_NIGHT_FILL },
    };
  });
}

function addSectionHeader(worksheet, title, totalColumns) {
  const row = worksheet.addRow([title]);

  worksheet.mergeCells(row.number, 1, row.number, totalColumns);
  styleSectionRow(row);
}

function addEmptyStateRow(worksheet, totalColumns, label) {
  const row = worksheet.addRow([label]);

  worksheet.mergeCells(row.number, 1, row.number, totalColumns);
  styleBodyRow(row);
}

function getSectionCellValue({
  employeeKey,
  date,
  sectionKey,
  planningBySectionEmployeeDate,
  reposByEmployeeDate,
  nightByEmployeeDate,
}) {
  const employeeDateKey = `${employeeKey}|${date}`;

  if (reposByEmployeeDate.has(employeeDateKey)) {
    return "REPOS";
  }

  if (nightByEmployeeDate.has(`${employeeDateKey}|CONFLIT`)) {
    return "CONFLIT";
  }

  if (nightByEmployeeDate.has(`${employeeDateKey}|NUIT`)) {
    return "NUIT";
  }

  return planningBySectionEmployeeDate.get(
    `${sectionKey}|${employeeKey}|${date}`
  ) || "-";
}

function addEmployeeSectionRows(worksheet, sectionKey, employees, dateColumns, maps) {
  const totalColumns = 1 + dateColumns.length;

  addSectionHeader(worksheet, sectionKey, totalColumns);

  if (employees.length === 0) {
    addEmptyStateRow(worksheet, totalColumns, "Aucune ligne.");
    return;
  }

  employees.forEach((employee) => {
    const row = worksheet.addRow([
      employee.full_name || "-",
      ...dateColumns.map((date) =>
        getSectionCellValue({
          employeeKey: employee.key,
          date,
          sectionKey,
          planningBySectionEmployeeDate: maps.planningBySectionEmployeeDate,
          reposByEmployeeDate: maps.reposByEmployeeDate,
          nightByEmployeeDate: maps.nightByEmployeeDate,
        })
      ),
    ]);

    styleBodyRow(row);
  });
}

function addNightSectionRows(worksheet, dateColumns, nightByDate) {
  const totalColumns = 1 + dateColumns.length;

  addSectionHeader(worksheet, "NUIT", totalColumns);

  const row = worksheet.addRow([
    "Employé Nuit",
    ...dateColumns.map((date) => {
      const rows = nightByDate.get(date) || [];

      if (rows.length === 0) {
        return "-";
      }

      if (rows.some((item) => item.label === "CONFLIT")) {
        return "CONFLIT";
      }

      return rows.map((item) => item.full_name).join(", ");
    }),
  ]);

  styleBodyRow(row);
  styleNightAssignmentRow(row);
}

async function buildPlanningExcelExport(startDate, endDate) {
  const [planningRows, reposRows] = await Promise.all([
    fetchPlanningRows(startDate, endDate),
    fetchReposRows(startDate, endDate),
  ]);
  const workbook = new ExcelJS.Workbook();
  const dateColumns = buildDateRange(startDate, endDate);
  const totalColumns = 1 + dateColumns.length;
  const maps = buildPlanningMaps(planningRows, reposRows);
  const worksheet = workbook.addWorksheet("Planning");

  workbook.creator = "Gestion Planning Presence";
  workbook.created = new Date();

  applyWorksheetLayout(worksheet, totalColumns);
  worksheet.getCell("A2").value = `Période: ${startDate} au ${endDate}`;

  worksheet.columns = [
    { key: "employee", width: 30 },
    ...dateColumns.map((date) => ({
      key: date,
      width: 20,
    })),
  ];

  const headerRow = worksheet.addRow([
    "TAZA GARE ROUTIERE",
    ...dateColumns.map((date) => getDayColumnLabel(date)),
  ]);

  styleHeaderRow(headerRow);
  addEmployeeSectionRows(
    worksheet,
    "MATIN",
    maps.sectionEmployees.MATIN,
    dateColumns,
    maps
  );
  addEmployeeSectionRows(
    worksheet,
    "SOIR",
    maps.sectionEmployees.SOIR,
    dateColumns,
    maps
  );
  addNightSectionRows(worksheet, dateColumns, maps.nightByDate);

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    filename: `planning-${startDate}-to-${endDate}.xlsx`,
  };
}

module.exports = {
  buildPlanningExcelExport,
};
