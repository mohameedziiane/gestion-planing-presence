const db = require("../config/db");

class ValidationServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ValidationServiceError";
    this.statusCode = statusCode;
  }
}

function parseUtcDate(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = parseUtcDate(value);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    formatUtcDate(parsedDate) === value
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function getWeekStart(dateString) {
  const date = parseUtcDate(dateString);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return formatUtcDate(date);
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const currentDate = parseUtcDate(startDate);
  const finalDate = parseUtcDate(endDate);

  while (currentDate <= finalDate) {
    dates.push(formatUtcDate(currentDate));
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return dates;
}

function buildIssue(type, level, date, message) {
  return {
    type,
    level,
    date,
    message,
  };
}

function addIssue(collection, dedupeSet, issue) {
  const issueKey = [issue.type, issue.level, issue.date, issue.message].join("|");

  if (dedupeSet.has(issueKey)) {
    return;
  }

  dedupeSet.add(issueKey);
  collection.push(issue);
}

function parseReposType(type) {
  const match = String(type || "").match(/^(\d+)j$/i);

  return match ? Number(match[1]) : null;
}

function isControlRole(roleName) {
  return normalizeText(roleName).startsWith("CONTROLE");
}

function isGuichetRole(roleName) {
  return normalizeText(roleName) === "GUICHET";
}

function isGuichetCaisseRole(roleName) {
  const normalizedRole = normalizeText(roleName)
    .replace(/\+/g, "/")
    .replace(/\s+/g, "");

  return normalizedRole === "GUICHET/CAISSE" || normalizedRole === "CAISSE/GUICHET";
}

function normalizeRoleLabel(roleName) {
  const normalizedRole = normalizeText(roleName)
    .replace(/\+/g, "/")
    .replace(/\s+/g, "");

  return normalizedRole;
}

function isForbiddenRoleLabel(roleName) {
  const normalizedRole = normalizeRoleLabel(roleName).replace(/Ã”/g, "O");

  return (
    normalizedRole.includes("CAISSE") ||
    normalizedRole.includes("/") ||
    normalizedRole.includes("+") ||
    normalizedRole === "GUICHETCONTROLE" ||
    normalizedRole === "CAISSECONTROLE" ||
    normalizedRole === "GUICHETCAISSE" ||
    normalizedRole === "CAISSEGUICHET"
  );
}

function isValidPersistedRole(roleName) {
  const normalizedRole = normalizeRoleLabel(roleName);

  return ["GUICHET", "CONTROLE"].includes(normalizedRole);
}

const CONTROL_REPLACEMENT_PRIORITY = [
  "YOUNESS BELHOUARI",
  "YOUNES BELHOUARI",
  "AYOUB LAHLALI",
  "SABER ABOABDALLAH",
];

function getControlReplacementPriority(employee) {
  const priorityIndex = CONTROL_REPLACEMENT_PRIORITY.indexOf(
    normalizeText(getEmployeeFullName(employee))
  );

  return priorityIndex === -1 ? Number.MAX_SAFE_INTEGER : priorityIndex;
}

function compareControlReplacementPriority(left, right) {
  const priorityDifference =
    getControlReplacementPriority(left) -
    getControlReplacementPriority(right);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return Number(left.id) - Number(right.id);
}

function isDisplayOnlyTransferMarker(row) {
  return normalizeText(row?.display_status) === "TRANSFERRED_OUT";
}

function isCrossShiftControlTransferRow(row) {
  return (
    normalizeText(row?.transfer_type) === "CROSS_SHIFT_CONTROL" ||
    normalizeText(row?.debugReason) === "CONTROL_CROSS_SHIFT_TRANSFER"
  );
}

function getOppositeDayPeriodName(periodName) {
  const normalizedPeriodName = normalizeText(periodName);

  if (normalizedPeriodName === "MATIN") {
    return "SOIR";
  }

  if (normalizedPeriodName === "SOIR") {
    return "MATIN";
  }

  return null;
}

async function hasNightAuthorizationColumn() {
  const [rows] = await db.query(
    "SHOW COLUMNS FROM employes LIKE 'travail_nuit_autorise'"
  );

  return rows.length > 0;
}

async function fetchPlanningRows(startDate, endDate, includeNightAuthorization) {
  const nightColumnSelect = includeNightAuthorization
    ? ", e.travail_nuit_autorise"
    : "";

  const [rows] = await db.query(
    `
      SELECT
        p.id,
        p.employe_id,
        DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
        p.periode_id,
        p.role_travail_id,
        pt.nom AS periode_travail,
        rt.nom AS role_travail,
        e.prenom,
        e.nom,
        e.sexe,
        e.groupe_id,
        e.actif,
        e.controle_fixe,
        e.ordre_nuit,
        g.nom AS groupe
        ${nightColumnSelect}
      FROM planning p
      JOIN employes e ON e.id = p.employe_id
      JOIN groupes g ON g.id = e.groupe_id
      JOIN periodes_travail pt ON pt.id = p.periode_id
      JOIN roles_travail rt ON rt.id = p.role_travail_id
      WHERE p._date BETWEEN ? AND ?
      ORDER BY p._date ASC, p.periode_id ASC, p.employe_id ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

async function fetchReposRows(startDate, endDate) {
  const [rows] = await db.query(
    `
      SELECT
        r.id,
        r.employe_id,
        DATE_FORMAT(r._date, '%Y-%m-%d') AS date,
        r.type,
        e.prenom,
        e.nom,
        e.sexe,
        e.groupe_id,
        e.controle_fixe,
        cp.nom AS controle_periode,
        g.nom AS groupe
      FROM repos r
      JOIN employes e ON e.id = r.employe_id
      JOIN groupes g ON g.id = e.groupe_id
      LEFT JOIN periodes_travail cp ON cp.id = e.controle_periode_id
      WHERE r._date BETWEEN ? AND ?
      ORDER BY r._date ASC, r.employe_id ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

async function fetchEmployeeRows(includeNightAuthorization) {
  const nightColumnSelect = includeNightAuthorization
    ? ", e.travail_nuit_autorise"
    : "";

  const [rows] = await db.query(
    `
      SELECT
        e.id,
        e.prenom,
        e.nom,
        e.sexe,
        e.groupe_id,
        e.actif,
        e.controle_fixe,
        e.ordre_nuit,
        g.nom AS groupe
        ${nightColumnSelect}
      FROM employes e
      JOIN groupes g ON g.id = e.groupe_id
      WHERE e.actif = TRUE
      ORDER BY g.nom ASC, e.id ASC
    `
  );

  return rows;
}

async function fetchPresenceRows(startDate, endDate) {
  const [rows] = await db.query(
    `
      SELECT
        p.id,
        p.employe_id,
        DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
        p.statut,
        e.prenom,
        e.nom
      FROM presence p
      JOIN employes e ON e.id = p.employe_id
      WHERE p._date BETWEEN ? AND ?
      ORDER BY p._date ASC, p.employe_id ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

function validatePlanningAndReposSameDate(planningRows, reposByEmployeDate, errors, dedupe) {
  for (const planningRow of planningRows) {
    const reposKey = `${planningRow.employe_id}|${planningRow.date}`;

    if (!reposByEmployeDate.has(reposKey)) {
      continue;
    }

    addIssue(
      errors,
      dedupe,
      buildIssue(
        "PLANNING_REPOS_CONFLICT",
        "error",
        planningRow.date,
        `${planningRow.prenom} ${planningRow.nom} is assigned to planning and repos on the same date.`
      )
    );
  }
}

function validateDuplicateAssignments(planningRows, errors, dedupe) {
  const assignmentsByEmployeDate = planningRows.reduce((result, planningRow) => {
    const key = `${planningRow.employe_id}|${planningRow.date}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  Object.values(assignmentsByEmployeDate).forEach((rows) => {
    if (rows.length <= 1) {
      return;
    }

    addIssue(
      errors,
      dedupe,
      buildIssue(
        "DUPLICATE_ASSIGNMENT",
        "error",
        rows[0].date,
        `${rows[0].prenom} ${rows[0].nom} is assigned ${rows.length} times on the same date.`
      )
    );
  });
}

function validateDuplicatePlanningRowsByPeriod(planningRows, errors, dedupe) {
  const rowsByEmployeeDatePeriod = planningRows.reduce((result, planningRow) => {
    const key = `${planningRow.employe_id}|${planningRow.date}|${planningRow.periode_id}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  Object.values(rowsByEmployeeDatePeriod).forEach((rows) => {
    if (rows.length <= 1) {
      return;
    }

    addIssue(
      errors,
      dedupe,
      buildIssue(
        "DUPLICATE_EMPLOYEE_DATE_PERIOD",
        "error",
        rows[0].date,
        `Conflit: ${rows[0].prenom} ${rows[0].nom} a plusieurs lignes planning pour ${rows[0].periode_travail} le même jour.`
      )
    );
  });
}

function validateMinimumStaff(planningRows, warnings, dedupe) {
  const activePlanningRows = planningRows.filter((planningRow) => {
    const periodName = normalizeText(planningRow.periode_travail);
    const roleName = normalizeText(planningRow.role_travail);

    return (
      (periodName === "MATIN" || periodName === "SOIR") &&
      roleName !== "REPOS"
    );
  });
  const staffByGroupShift = activePlanningRows.reduce((result, planningRow) => {
    const key = `${planningRow.date}|${planningRow.groupe_id}|${normalizeText(planningRow.periode_travail)}`;

    if (!result[key]) {
      result[key] = {
        date: planningRow.date,
        groupe: planningRow.groupe,
        periode: planningRow.periode_travail,
        employeIds: new Set(),
      };
    }

    result[key].employeIds.add(planningRow.employe_id);

    return result;
  }, {});

  Object.values(staffByGroupShift).forEach((entry) => {
    if (entry.employeIds.size >= 3) {
      return;
    }

    addIssue(
      warnings,
      dedupe,
      buildIssue(
        "MINIMUM_STAFF",
        "warning",
        entry.date,
        `${entry.periode} shift in ${entry.groupe} has fewer than 3 employees.`
      )
    );
  });
}

function validateRoleRules(planningRows, errors, dedupe) {
  for (const planningRow of planningRows) {
    const periodName = normalizeText(planningRow.periode_travail);
    const roleName = normalizeRoleLabel(planningRow.role_travail);

    if (!isValidPersistedRole(planningRow.role_travail)) {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "INVALID_ROLE",
          "error",
          planningRow.date,
          `Conflit: rôle invalide '${planningRow.role_travail}' pour ${planningRow.prenom} ${planningRow.nom}.`
        )
      );
    }

    if (isForbiddenRoleLabel(planningRow.role_travail)) {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "FORBIDDEN_ROLE",
          "error",
          planningRow.date,
          `Conflit: rÃ´le interdit '${planningRow.role_travail}' pour ${planningRow.prenom} ${planningRow.nom}.`
        )
      );
    }

    if (planningRow.display_role && isForbiddenRoleLabel(planningRow.display_role)) {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "FORBIDDEN_DISPLAY_ROLE",
          "error",
          planningRow.date,
          `Conflit: libellÃ© d'affichage interdit '${planningRow.display_role}' pour ${planningRow.prenom} ${planningRow.nom}.`
        )
      );
    }

    if (periodName === "NUIT" && roleName !== "GUICHET") {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "NIGHT_ROLE",
          "error",
          planningRow.date,
          `Conflit: le rÃ´le Nuit de ${planningRow.prenom} ${planningRow.nom} doit Ãªtre Guichet.`
        )
      );
    }

    const employeeName = normalizeText(`${planningRow.prenom} ${planningRow.nom}`);

    if (employeeName === "MONCEF EL AMRI" && periodName === "SOIR") {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "FIXED_CONTROL_WRONG_PERIOD",
          "error",
          planningRow.date,
          `Conflit: MONCEF EL AMRI ne doit jamais etre affecte en Soir.`
        )
      );
    }

    if (employeeName === "SAID NACER" && periodName === "MATIN") {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "FIXED_CONTROL_WRONG_PERIOD",
          "error",
          planningRow.date,
          `Conflit: SAID NACER ne doit jamais etre affecte en Matin.`
        )
      );
    }

    if (periodName !== "NUIT" && isForbiddenRoleLabel(planningRow.role_travail)) {
      addIssue(
        errors,
        dedupe,
        buildIssue(
          "FORBIDDEN_ROLE_OUTSIDE_NIGHT",
          "error",
          planningRow.date,
          `Conflit: Caisse et les roles combines sont interdits (${planningRow.prenom} ${planningRow.nom}).`
        )
      );
    }
  }
}

function validateNightAndDaySameDate(planningRows, errors, dedupe) {
  const rowsByEmployeeDate = planningRows.reduce((result, planningRow) => {
    const key = `${planningRow.employe_id}|${planningRow.date}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  Object.values(rowsByEmployeeDate).forEach((rows) => {
    const hasNight = rows.some(
      (row) => normalizeText(row.periode_travail) === "NUIT"
    );
    const hasDayShift = rows.some((row) =>
      ["MATIN", "SOIR"].includes(normalizeText(row.periode_travail))
    );

    if (!hasNight || !hasDayShift) {
      return;
    }

    addIssue(
      errors,
      dedupe,
      buildIssue(
        "NIGHT_DAY_CONFLICT",
        "error",
        rows[0].date,
        `Conflit: ${rows[0].prenom} ${rows[0].nom} a Nuit et Matin/Soir le même jour.`
      )
    );
  });
}

function validateNightShiftRules(planningRows, weekDates, hasNightAuthorization, errors, warnings, errorDedupe, warningDedupe) {
  const nightRows = planningRows.filter(
    (planningRow) => normalizeText(planningRow.periode_travail) === "NUIT"
  );
  const nightRowsByDate = nightRows.reduce((result, planningRow) => {
    if (!result[planningRow.date]) {
      result[planningRow.date] = [];
    }

    result[planningRow.date].push(planningRow);

    return result;
  }, {});

  Object.entries(nightRowsByDate).forEach(([date, rows]) => {
    if (rows.length > 1) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_OVERSTAFF",
          "error",
          date,
          `Night shift has more than 1 employee (${rows.length} assigned).`
        )
      );
    }
  });

  for (const date of weekDates) {
    const rows = nightRowsByDate[date] || [];

    if (rows.length === 0) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_MISSING",
          "error",
          date,
          `Conflit: aucun employé en Nuit le ${date}.`
        )
      );
    }
  }

  for (const planningRow of nightRows) {
    if (isControlRole(planningRow.role_travail)) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_CONTROL",
          "error",
          planningRow.date,
          `Night shift includes a Controle role for ${planningRow.prenom} ${planningRow.nom}.`
        )
      );
    }

    if (normalizeRoleLabel(planningRow.role_travail) !== "GUICHET") {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_ROLE",
          "error",
          planningRow.date,
          `Conflit: le role Nuit de ${planningRow.prenom} ${planningRow.nom} doit etre Guichet.`
        )
      );
    }

    if (Number(planningRow.actif) !== 1) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_INACTIVE_EMPLOYEE",
          "error",
          planningRow.date,
          `Conflit: ${planningRow.prenom} ${planningRow.nom} est inactif et affecté en Nuit.`
        )
      );
    }

    if (planningRow.ordre_nuit === null || planningRow.ordre_nuit === undefined) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_ORDER_MISSING",
          "error",
          planningRow.date,
          `Conflit: ${planningRow.prenom} ${planningRow.nom} est en Nuit sans ordre_nuit.`
        )
      );
    }

    if (planningRow.sexe !== "Homme") {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "NIGHT_FEMALE",
          "error",
          planningRow.date,
          `Conflit: ${planningRow.prenom} ${planningRow.nom} ne peut pas travailler en Nuit.`
        )
      );
    }

    if (hasNightAuthorization) {
      if (Number(planningRow.travail_nuit_autorise) !== 1) {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "NIGHT_AUTHORIZATION",
            "error",
            planningRow.date,
            `${planningRow.prenom} ${planningRow.nom} is assigned to night without night authorization.`
          )
        );
      }
    }
  }

  if (!hasNightAuthorization && nightRows.length > 0) {
    addIssue(
      warnings,
      warningDedupe,
      buildIssue(
        "NIGHT_AUTHORIZATION_CHECK_SKIPPED",
        "warning",
        nightRows[0].date,
        "Night authorization could not be validated because employes.travail_nuit_autorise is missing."
      )
    );
  }
}

function getEmployeeFullName(employee) {
  return `${employee.prenom || ""} ${employee.nom || ""}`.trim();
}

function getExpectedFixedControlName(groupName) {
  const normalizedGroupName = normalizeText(groupName);

  if (normalizedGroupName === "GROUPE A") {
    return "MONCEF EL AMRI";
  }

  if (normalizedGroupName === "GROUPE B") {
    return "SAID NACER";
  }

  return null;
}

function getExpectedFixedControlNameForPeriod(periodName) {
  const normalizedPeriodName = normalizeText(periodName);

  if (normalizedPeriodName === "MATIN") {
    return "MONCEF EL AMRI";
  }

  if (normalizedPeriodName === "SOIR") {
    return "SAID NACER";
  }

  return null;
}

function buildNightEmployeeDateSet(planningRows) {
  const result = new Set();

  for (const planningRow of planningRows) {
    if (normalizeText(planningRow.periode_travail) !== "NUIT") {
      continue;
    }

    result.add(`${planningRow.employe_id}|${planningRow.date}`);
  }

  return result;
}

function isEmployeeUnavailableForControl(employee, date, reposByEmployeDate, nightEmployeeDateSet) {
  const employeeDateKey = `${employee.id}|${date}`;

  return reposByEmployeDate.has(employeeDateKey) || nightEmployeeDateSet.has(employeeDateKey);
}

function getPlanningRowsByEmployeeDate(planningRows) {
  return planningRows.reduce((result, planningRow) => {
    const key = `${planningRow.employe_id}|${planningRow.date}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});
}

function isValidFixedPeriodControlReplacement({
  employee,
  fixedControl,
  date,
  targetPeriodId,
  rows,
  planningRowsByEmployeeDate,
  reposByEmployeDate,
  nightEmployeeDateSet,
}) {
  if (!employee || !fixedControl) {
    return false;
  }

  if (Number(employee.id) === Number(fixedControl.id)) {
    return false;
  }

  if (employee.sexe !== "Homme") {
    return false;
  }

  if (Number(employee.actif) !== 1) {
    return false;
  }

  if (Number(employee.controle_fixe) === 1) {
    return false;
  }

  if (
    isEmployeeUnavailableForControl(
      employee,
      date,
      reposByEmployeDate,
      nightEmployeeDateSet
    )
  ) {
    return false;
  }

  const hasTargetShiftRow = rows.some((row) =>
    Number(row.employe_id) === Number(employee.id)
  );

  if (!hasTargetShiftRow) {
    return false;
  }

  const employeeRowsForDate =
    planningRowsByEmployeeDate[`${employee.id}|${date}`] || [];

  return employeeRowsForDate.every((row) =>
    Number(row.periode_id) === Number(targetPeriodId)
  );
}

function isValidCrossShiftControlTransferCandidate({
  employee,
  fixedControl,
  date,
  targetPeriodName,
  sourceRows,
  planningRowsByEmployeeDate,
  reposByEmployeDate,
  nightEmployeeDateSet,
}) {
  if (!employee || !fixedControl) {
    return false;
  }

  if (Number(employee.id) === Number(fixedControl.id)) {
    return false;
  }

  if (employee.sexe !== "Homme") {
    return false;
  }

  if (Number(employee.actif) !== 1) {
    return false;
  }

  if (Number(employee.controle_fixe) === 1) {
    return false;
  }

  if (
    isEmployeeUnavailableForControl(
      employee,
      date,
      reposByEmployeDate,
      nightEmployeeDateSet
    )
  ) {
    return false;
  }

  const normalizedTargetPeriod = normalizeText(targetPeriodName);
  const employeeName = normalizeText(getEmployeeFullName(employee));

  if (normalizedTargetPeriod === "MATIN" && employeeName === "SAID NACER") {
    return false;
  }

  if (normalizedTargetPeriod === "SOIR" && employeeName === "MONCEF EL AMRI") {
    return false;
  }

  const hasSourceGuichetRow = sourceRows.some(
    (row) =>
      Number(row.employe_id) === Number(employee.id) &&
      isGuichetRole(row.role_travail)
  );
  const employeeRowsForDate =
    planningRowsByEmployeeDate[`${employee.id}|${date}`] || [];
  const hasCrossShiftTransferMetadata = employeeRowsForDate.some(
    (row) =>
      isCrossShiftControlTransferRow(row) &&
      normalizeText(row.source_period || row.fromPeriodName) ===
        getOppositeDayPeriodName(targetPeriodName)
  );

  if (!hasSourceGuichetRow && !hasCrossShiftTransferMetadata) {
    return false;
  }

  if (
    hasCrossShiftTransferMetadata &&
    sourceRows.some((row) => Number(row.employe_id) === Number(employee.id))
  ) {
    return false;
  }

  return true;
}

function findBestCrossShiftControlTransferCandidate({
  sourceRows,
  controlRows,
  employeeById,
  fixedControl,
  firstRow,
  planningRowsByEmployeeDate,
  reposByEmployeDate,
  nightEmployeeDateSet,
}) {
  const candidatesById = new Map();

  sourceRows.forEach((sourceRow) => {
    if (!isGuichetRole(sourceRow.role_travail)) {
      return;
    }

    const employee = employeeById.get(Number(sourceRow.employe_id));

    if (employee) {
      candidatesById.set(Number(employee.id), employee);
    }
  });

  controlRows
    .filter(isCrossShiftControlTransferRow)
    .forEach((controlRow) => {
      const employee = employeeById.get(Number(controlRow.employe_id));

      if (employee) {
        candidatesById.set(Number(employee.id), employee);
      }
    });

  return (
    [...candidatesById.values()]
      .filter((employee) =>
        isValidCrossShiftControlTransferCandidate({
          employee,
          fixedControl,
          date: firstRow.date,
          targetPeriodName: firstRow.periode_travail,
          sourceRows,
          planningRowsByEmployeeDate,
          reposByEmployeDate,
          nightEmployeeDateSet,
        })
      )
      .sort(compareControlReplacementPriority)[0] || null
  );
}

function findBestFixedPeriodControlReplacement({
  rows,
  employeeById,
  fixedControl,
  firstRow,
  planningRowsByEmployeeDate,
  reposByEmployeDate,
  nightEmployeeDateSet,
}) {
  return (
    rows
      .filter((planningRow) => !isCrossShiftControlTransferRow(planningRow))
      .map((planningRow) => employeeById.get(Number(planningRow.employe_id)))
      .filter((employee, index, employees) =>
        employee &&
        employees.findIndex((candidate) => Number(candidate?.id) === Number(employee.id)) === index
      )
      .filter((employee) =>
        isValidFixedPeriodControlReplacement({
          employee,
          fixedControl,
          date: firstRow.date,
          targetPeriodId: firstRow.periode_id,
          rows,
          planningRowsByEmployeeDate,
          reposByEmployeDate,
          nightEmployeeDateSet,
        })
      )
      .sort(compareControlReplacementPriority)[0] || null
  );
}

function validateDayShiftControlRules({
  planningRows,
  employees,
  reposByEmployeDate,
  errors,
  warnings,
  errorDedupe,
  warningDedupe,
}) {
  const employeeById = new Map(
    employees.map((employee) => [Number(employee.id), employee])
  );
  const activeEmployeesByGroup = employees.reduce((result, employee) => {
    const groupKey = Number(employee.groupe_id);

    if (!result[groupKey]) {
      result[groupKey] = [];
    }

    result[groupKey].push(employee);

    return result;
  }, {});
  const nightEmployeeDateSet = buildNightEmployeeDateSet(planningRows);
  const dayRowsByDatePeriodGroup = planningRows.reduce((result, planningRow) => {
    const periodName = normalizeText(planningRow.periode_travail);

    if (!["MATIN", "SOIR"].includes(periodName)) {
      return result;
    }

    const key = `${planningRow.date}|${planningRow.periode_id}|${planningRow.groupe_id}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  Object.values(dayRowsByDatePeriodGroup).forEach((rows) => {
    const firstRow = rows[0];
    const expectedFixedControlName = getExpectedFixedControlName(firstRow.groupe);
    const groupEmployees = activeEmployeesByGroup[Number(firstRow.groupe_id)] || [];
    const fixedControl = groupEmployees.find(
      (employee) =>
        normalizeText(getEmployeeFullName(employee)) ===
          normalizeText(expectedFixedControlName) ||
        Number(employee.controle_fixe) === 1
    );
    const controlRows = rows.filter((row) => isControlRole(row.role_travail));

    if (controlRows.length > 1) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "MULTIPLE_DAY_CONTROL",
          "error",
          firstRow.date,
          `Conflit: plusieurs Controle dans ${firstRow.groupe} ${firstRow.periode_travail}.`
        )
      );
    }

    if (!fixedControl) {
      addIssue(
        warnings,
        warningDedupe,
        buildIssue(
          "FIXED_CONTROL_MISSING",
          "warning",
          firstRow.date,
          `Avertissement: Controle fixe introuvable pour ${firstRow.groupe}.`
        )
      );
      return;
    }

    const fixedControlUnavailable = isEmployeeUnavailableForControl(
      fixedControl,
      firstRow.date,
      reposByEmployeDate,
      nightEmployeeDateSet
    );

    if (controlRows.length === 0) {
      const replacementExists = groupEmployees.some((employee) => {
        if (Number(employee.id) === Number(fixedControl.id)) {
          return false;
        }

        return (
          employee.sexe === "Homme" &&
          Number(employee.controle_fixe) !== 1 &&
          !isEmployeeUnavailableForControl(
            employee,
            firstRow.date,
            reposByEmployeDate,
            nightEmployeeDateSet
          )
        );
      });

      if (fixedControlUnavailable && !replacementExists) {
        addIssue(
          warnings,
          warningDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_MISSING",
            "warning",
            firstRow.date,
            `Avertissement: aucun remplacant Controle disponible pour ${fixedControl.prenom} ${fixedControl.nom} dans ${firstRow.groupe}.`
          )
        );
      } else {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "DAY_CONTROL_MISSING",
            "error",
            firstRow.date,
            `Conflit: Controle manquant dans ${firstRow.groupe} ${firstRow.periode_travail}.`
          )
        );
      }

      return;
    }

    const controlRow = controlRows[0];
    const controlEmployee = employeeById.get(Number(controlRow.employe_id));

    if (!controlEmployee) {
      return;
    }

    if (
      !fixedControlUnavailable &&
      Number(controlEmployee.id) !== Number(fixedControl.id)
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "FIXED_CONTROL_NOT_USED",
          "error",
          firstRow.date,
          `Controle invalide: ${fixedControl.prenom} ${fixedControl.nom} est disponible mais n'est pas utilise dans ${firstRow.groupe}.`
        )
      );
    }

    if (
      fixedControlUnavailable &&
      Number(controlEmployee.id) !== Number(fixedControl.id)
    ) {
      if (Number(controlEmployee.groupe_id) !== Number(firstRow.groupe_id)) {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_WRONG_GROUP",
            "error",
            firstRow.date,
            `Controle invalide: remplacant hors groupe (${controlEmployee.prenom} ${controlEmployee.nom}).`
          )
        );
      }

      if (controlEmployee.sexe !== "Homme") {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_NOT_MALE",
            "error",
            firstRow.date,
            `Controle invalide: le remplacant ${controlEmployee.prenom} ${controlEmployee.nom} doit etre un homme.`
          )
        );
      }

      if (Number(controlEmployee.controle_fixe) === 1) {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_OTHER_FIXED_CONTROL",
            "error",
            firstRow.date,
            `Controle invalide: ${controlEmployee.prenom} ${controlEmployee.nom} est un Controle fixe.`
          )
        );
      }

      if (
        isEmployeeUnavailableForControl(
          controlEmployee,
          firstRow.date,
          reposByEmployeDate,
          nightEmployeeDateSet
        )
      ) {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_UNAVAILABLE",
            "error",
            firstRow.date,
            `Controle invalide: le remplacant ${controlEmployee.prenom} ${controlEmployee.nom} est indisponible.`
          )
        );
      }
    }
  });
}

function validateFixedPeriodDayShiftControlRules({
  planningRows,
  employees,
  reposByEmployeDate,
  errors,
  warnings,
  errorDedupe,
  warningDedupe,
}) {
  const employeeById = new Map(
    employees.map((employee) => [Number(employee.id), employee])
  );
  const nightEmployeeDateSet = buildNightEmployeeDateSet(planningRows);
  const planningRowsByEmployeeDate = getPlanningRowsByEmployeeDate(planningRows);
  const dayRowsByDatePeriod = planningRows.reduce((result, planningRow) => {
    const periodName = normalizeText(planningRow.periode_travail);

    if (!["MATIN", "SOIR"].includes(periodName)) {
      return result;
    }

    const key = `${planningRow.date}|${planningRow.periode_id}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  Object.values(dayRowsByDatePeriod).forEach((rows) => {
    const firstRow = rows[0];
    const periodName = normalizeText(firstRow.periode_travail);
    const oppositePeriodName = getOppositeDayPeriodName(firstRow.periode_travail);
    const oppositeRows = oppositePeriodName
      ? planningRows.filter(
          (planningRow) =>
            planningRow.date === firstRow.date &&
            normalizeText(planningRow.periode_travail) === oppositePeriodName
        )
      : [];
    const expectedFixedControlName = getExpectedFixedControlNameForPeriod(
      firstRow.periode_travail
    );
    const fixedControl = employees.find(
      (employee) =>
        normalizeText(getEmployeeFullName(employee)) ===
        normalizeText(expectedFixedControlName)
    );
    const controlRows = rows.filter((row) => isControlRole(row.role_travail));

    if (controlRows.length > 1) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "MULTIPLE_DAY_CONTROL",
          "error",
          firstRow.date,
          `Conflit: plusieurs Controle dans ${firstRow.periode_travail}.`
        )
      );
    }

    if (!fixedControl) {
      addIssue(
        warnings,
        warningDedupe,
        buildIssue(
          "FIXED_CONTROL_MISSING",
          "warning",
          firstRow.date,
          `Avertissement: Controle fixe introuvable pour ${firstRow.periode_travail}.`
        )
      );
      return;
    }

    const fixedControlUnavailable = isEmployeeUnavailableForControl(
      fixedControl,
      firstRow.date,
      reposByEmployeDate,
      nightEmployeeDateSet
    );
    const bestReplacement = findBestFixedPeriodControlReplacement({
      rows,
      employeeById,
      fixedControl,
      firstRow,
      planningRowsByEmployeeDate,
      reposByEmployeDate,
      nightEmployeeDateSet,
    });
    const bestTransferCandidate = findBestCrossShiftControlTransferCandidate({
      sourceRows: oppositeRows,
      controlRows,
      employeeById,
      fixedControl,
      firstRow,
      planningRowsByEmployeeDate,
      reposByEmployeDate,
      nightEmployeeDateSet,
    });

    if (controlRows.length === 0) {
      if (fixedControlUnavailable && !bestReplacement && !bestTransferCandidate) {
        addIssue(
          warnings,
          warningDedupe,
          buildIssue(
            "CONTROL_REPLACEMENT_MISSING",
            "warning",
            firstRow.date,
            `Avertissement: aucun remplacant Controle disponible pour ${fixedControl.prenom} ${fixedControl.nom} en ${firstRow.periode_travail}.`
          )
        );
      } else {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "DAY_CONTROL_MISSING",
            "error",
            firstRow.date,
            `Conflit: Controle manquant en ${firstRow.periode_travail}.`
          )
        );
      }

      return;
    }

    if (controlRows.length !== 1) {
      return;
    }

    const controlRow = controlRows[0];
    const controlEmployee = employeeById.get(Number(controlRow.employe_id));

    if (!controlEmployee) {
      return;
    }

    if (periodName === "MATIN" && normalizeText(getEmployeeFullName(controlEmployee)) === "SAID NACER") {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "FIXED_CONTROL_WRONG_PERIOD",
          "error",
          firstRow.date,
          "Conflit: SAID NACER ne doit jamais etre Controle en Matin."
        )
      );
    }

    if (periodName === "SOIR" && normalizeText(getEmployeeFullName(controlEmployee)) === "MONCEF EL AMRI") {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "FIXED_CONTROL_WRONG_PERIOD",
          "error",
          firstRow.date,
          "Conflit: MONCEF EL AMRI ne doit jamais etre Controle en Soir."
        )
      );
    }

    if (!fixedControlUnavailable) {
      if (Number(controlEmployee.id) !== Number(fixedControl.id)) {
        addIssue(
          errors,
          errorDedupe,
          buildIssue(
            "FIXED_CONTROL_NOT_USED",
            "error",
            firstRow.date,
            `Controle invalide: ${fixedControl.prenom} ${fixedControl.nom} est disponible mais n'est pas utilise en ${firstRow.periode_travail}.`
          )
        );
      }

      return;
    }

    if (Number(controlEmployee.id) === Number(fixedControl.id)) {
      return;
    }

    const isCrossShiftTransfer = isCrossShiftControlTransferRow(controlRow);
    const sourceRowsForControlEmployee = oppositeRows.filter(
      (row) => Number(row.employe_id) === Number(controlEmployee.id)
    );

    if (isCrossShiftTransfer && sourceRowsForControlEmployee.length > 0) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_TRANSFER_SOURCE_ROW_REMAINS",
          "error",
          firstRow.date,
          `Controle invalide: ${controlEmployee.prenom} ${controlEmployee.nom} conserve une ligne reelle en ${oppositePeriodName} apres transfert.`
        )
      );
    }

    if (controlEmployee.sexe !== "Homme") {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_REPLACEMENT_NOT_MALE",
          "error",
          firstRow.date,
          `Controle invalide: le remplacant ${controlEmployee.prenom} ${controlEmployee.nom} doit etre un homme.`
        )
      );
    }

    if (
      !isCrossShiftTransfer &&
      !isValidFixedPeriodControlReplacement({
        employee: controlEmployee,
        fixedControl,
        date: firstRow.date,
        targetPeriodId: firstRow.periode_id,
        rows,
        planningRowsByEmployeeDate,
        reposByEmployeDate,
        nightEmployeeDateSet,
      })
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_REPLACEMENT_INVALID",
          "error",
          firstRow.date,
          `Controle invalide: le remplacant ${controlEmployee.prenom} ${controlEmployee.nom} n'est pas disponible dans ${firstRow.periode_travail}.`
        )
      );
    }

    if (
      isCrossShiftTransfer &&
      !isValidCrossShiftControlTransferCandidate({
        employee: controlEmployee,
        fixedControl,
        date: firstRow.date,
        targetPeriodName: firstRow.periode_travail,
        sourceRows: oppositeRows,
        planningRowsByEmployeeDate,
        reposByEmployeDate,
        nightEmployeeDateSet,
      })
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_TRANSFER_INVALID",
          "error",
          firstRow.date,
          `Controle invalide: transfert temporaire invalide pour ${controlEmployee.prenom} ${controlEmployee.nom} en ${firstRow.periode_travail}.`
        )
      );
    }

    if (Number(controlEmployee.controle_fixe) === 1) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_REPLACEMENT_OTHER_FIXED_CONTROL",
          "error",
          firstRow.date,
          `Controle invalide: ${controlEmployee.prenom} ${controlEmployee.nom} est un Controle fixe.`
        )
      );
    }

    if (
      isEmployeeUnavailableForControl(
        controlEmployee,
        firstRow.date,
        reposByEmployeDate,
        nightEmployeeDateSet
      )
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_REPLACEMENT_UNAVAILABLE",
          "error",
          firstRow.date,
          `Controle invalide: le remplacant ${controlEmployee.prenom} ${controlEmployee.nom} est indisponible.`
        )
      );
    }

    if (isCrossShiftTransfer && bestReplacement) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_TRANSFER_SAME_SHIFT_AVAILABLE",
          "error",
          firstRow.date,
          `Controle invalide: ${bestReplacement.prenom} ${bestReplacement.nom} est disponible dans ${firstRow.periode_travail}; transfert temporaire interdit.`
        )
      );
    }

    if (
      !isCrossShiftTransfer &&
      bestReplacement &&
      Number(controlEmployee.id) !== Number(bestReplacement.id)
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_REPLACEMENT_PRIORITY",
          "error",
          firstRow.date,
          `Controle invalide: ${bestReplacement.prenom} ${bestReplacement.nom} est prioritaire sur ${controlEmployee.prenom} ${controlEmployee.nom} en ${firstRow.periode_travail}.`
        )
      );
    }

    if (
      isCrossShiftTransfer &&
      bestTransferCandidate &&
      Number(controlEmployee.id) !== Number(bestTransferCandidate.id)
    ) {
      addIssue(
        errors,
        errorDedupe,
        buildIssue(
          "CONTROL_TRANSFER_PRIORITY",
          "error",
          firstRow.date,
          `Controle invalide: ${bestTransferCandidate.prenom} ${bestTransferCandidate.nom} est prioritaire sur ${controlEmployee.prenom} ${controlEmployee.nom} pour le transfert temporaire en ${firstRow.periode_travail}.`
        )
      );
    }
  });
}

function validateControlReplacement(reposRows, planningRowsByDatePeriod, warnings, dedupe) {
  const fixedControlRepos = reposRows.filter(
    (reposRow) => Number(reposRow.controle_fixe) === 1
  );

  for (const reposRow of fixedControlRepos) {
    const controlPeriod = normalizeText(reposRow.controle_periode);
    const targetPeriod = ["MATIN", "SOIR"].includes(controlPeriod)
      ? controlPeriod
      : null;
    const shiftPlanningRows = targetPeriod
      ? planningRowsByDatePeriod[`${reposRow.date}|${targetPeriod}`] || []
      : [];
    const maleReplacementExists = shiftPlanningRows.some(
      (planningRow) =>
        planningRow.sexe === "Homme" &&
        Number(planningRow.controle_fixe) !== 1 &&
        Number(planningRow.employe_id) !== Number(reposRow.employe_id)
    );

    if (maleReplacementExists) {
      continue;
    }

    addIssue(
      warnings,
      dedupe,
      buildIssue(
        "CONTROL_REPLACEMENT_MISSING",
        "warning",
        reposRow.date,
        `${reposRow.prenom} ${reposRow.nom} is on repos and no male replacement exists in ${targetPeriod || "the fixed control shift"}.`
      )
    );
  }
}

function validateExcessRepos(reposRows, warnings, dedupe) {
  const reposByEmployeWeek = reposRows.reduce((result, reposRow) => {
    const weekStart = getWeekStart(reposRow.date);
    const key = `${reposRow.employe_id}|${weekStart}`;

    if (!result[key]) {
      result[key] = {
        weekStart,
        prenom: reposRow.prenom,
        nom: reposRow.nom,
        count: 0,
        expected: 0,
      };
    }

    result[key].count += 1;
    result[key].expected = Math.max(
      result[key].expected,
      parseReposType(reposRow.type) || 0
    );

    return result;
  }, {});

  Object.values(reposByEmployeWeek).forEach((entry) => {
    if (entry.expected === 0 || entry.count <= entry.expected) {
      return;
    }

    addIssue(
      warnings,
      dedupe,
      buildIssue(
        "EXCESS_REPOS",
        "warning",
        entry.weekStart,
        `${entry.prenom} ${entry.nom} has ${entry.count} repos days in the week starting ${entry.weekStart}, above the expected ${entry.expected}.`
      )
    );
  });
}

function validatePresenceReposConflict(presenceRows, reposByEmployeDate, errors, dedupe) {
  for (const presenceRow of presenceRows) {
    if (normalizeText(presenceRow.statut) !== "PRESENT") {
      continue;
    }

    const reposKey = `${presenceRow.employe_id}|${presenceRow.date}`;

    if (!reposByEmployeDate.has(reposKey)) {
      continue;
    }

    addIssue(
      errors,
      dedupe,
      buildIssue(
        "PRESENCE_REPOS_CONFLICT",
        "error",
        presenceRow.date,
        `${presenceRow.prenom} ${presenceRow.nom} is marked Present while also being on repos.`
      )
    );
  }
}

function validatePlanningSnapshot({
  planningRows = [],
  reposRows = [],
  presenceRows = [],
  employeeRows = [],
  weekDates = [],
  hasNightAuthorization = false,
}) {
  const realPlanningRows = planningRows.filter(
    (planningRow) => !isDisplayOnlyTransferMarker(planningRow)
  );
  const errors = [];
  const warnings = [];
  const errorDedupe = new Set();
  const warningDedupe = new Set();
  const reposByEmployeDate = new Map(
    reposRows.map((reposRow) => [`${reposRow.employe_id}|${reposRow.date}`, reposRow])
  );
  const planningRowsByDatePeriod = realPlanningRows.reduce((result, planningRow) => {
    const periodName = normalizeText(planningRow.periode_travail);

    if (!["MATIN", "SOIR"].includes(periodName)) {
      return result;
    }

    const key = `${planningRow.date}|${periodName}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  validatePlanningAndReposSameDate(
    realPlanningRows,
    reposByEmployeDate,
    errors,
    errorDedupe
  );
  validateDuplicateAssignments(realPlanningRows, errors, errorDedupe);
  validateDuplicatePlanningRowsByPeriod(realPlanningRows, errors, errorDedupe);
  validateRoleRules(realPlanningRows, errors, errorDedupe);
  validateNightAndDaySameDate(realPlanningRows, errors, errorDedupe);
  validateMinimumStaff(realPlanningRows, warnings, warningDedupe);
  validateNightShiftRules(
    realPlanningRows,
    weekDates,
    hasNightAuthorization,
    errors,
    warnings,
    errorDedupe,
    warningDedupe
  );
  validateFixedPeriodDayShiftControlRules({
    planningRows: realPlanningRows,
    employees: employeeRows,
    reposByEmployeDate,
    errors,
    warnings,
    errorDedupe,
    warningDedupe,
  });
  validateControlReplacement(
    reposRows,
    planningRowsByDatePeriod,
    warnings,
    warningDedupe
  );
  validateExcessRepos(reposRows, warnings, warningDedupe);
  validatePresenceReposConflict(
    presenceRows,
    reposByEmployeDate,
    errors,
    errorDedupe
  );

  return {
    errors,
    warnings,
    summary: {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
    },
  };
}

async function validatePlanningPeriod({ startDate, endDate }) {
  const normalizedStartDate = String(startDate || "").trim();
  const normalizedEndDate = String(endDate || "").trim();

  if (!normalizedStartDate || !normalizedEndDate) {
    throw new ValidationServiceError(
      400,
      "startDate and endDate are required"
    );
  }

  if (
    !isValidDateString(normalizedStartDate) ||
    !isValidDateString(normalizedEndDate)
  ) {
    throw new ValidationServiceError(
      400,
      "startDate and endDate must be valid dates in YYYY-MM-DD format"
    );
  }

  if (normalizedStartDate > normalizedEndDate) {
    throw new ValidationServiceError(
      400,
      "startDate must be before or equal to endDate"
    );
  }

  const hasNightAuthorization = await hasNightAuthorizationColumn();
  const weekDates = getDatesBetween(normalizedStartDate, normalizedEndDate);
  const [planningRows, reposRows, presenceRows, employeeRows] = await Promise.all([
    fetchPlanningRows(normalizedStartDate, normalizedEndDate, hasNightAuthorization),
    fetchReposRows(normalizedStartDate, normalizedEndDate),
    fetchPresenceRows(normalizedStartDate, normalizedEndDate),
    fetchEmployeeRows(hasNightAuthorization),
  ]);

  const validationResult = validatePlanningSnapshot({
    planningRows,
    reposRows,
    presenceRows,
    employeeRows,
    weekDates,
    hasNightAuthorization,
  });

  return {
    period: {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    },
    ...validationResult,
  };
}

module.exports = {
  ValidationServiceError,
  validatePlanningSnapshot,
  validatePlanningPeriod,
};
