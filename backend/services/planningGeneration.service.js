const db = require("../config/db");

const PLANNING_SELECT_QUERY = `
  SELECT
    p.id,
    p.employe_id,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
    e.prenom,
    e.nom,
    g.nom AS groupe,
    pt.nom AS periode_travail,
    rt.nom AS role_travail
  FROM planning p
  JOIN employes e ON e.id = p.employe_id
  JOIN groupes g ON g.id = e.groupe_id
  JOIN periodes_travail pt ON pt.id = p.periode_id
  JOIN roles_travail rt ON rt.id = p.role_travail_id
`;

const REPOS_SELECT_QUERY = `
  SELECT
    r.id,
    r.employe_id,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS date,
    r.type,
    e.prenom,
    e.nom,
    g.nom AS groupe
  FROM repos r
  JOIN employes e ON e.id = r.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

class PlanningGenerationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "PlanningGenerationError";
    this.statusCode = statusCode;
  }
}

const NIGHT_SHIFT_ANCHOR_DATE = "2026-05-01";
const NIGHT_SHIFT_BLOCK_LENGTH_DAYS = 7;
const REST_PATTERN_ANCHOR_DATE = "2026-04-27";
const PLANNING_WEEK_ANCHOR_DATE = REST_PATTERN_ANCHOR_DATE;
const GROUP_ROTATION_ANCHOR_DATE = "2026-05-11";
const NIGHT_CYCLE_ANCHOR_SATURDAY = "2026-05-09";
const NIGHT_BLOCK_LENGTH_DAYS = 7;
const NORMAL_REPOS_ANCHOR_DATE = "2026-05-11";
const MILLISECONDS_PER_DAY = 86400000;
const OFFICIAL_PATTERN_REFERENCE_DATE = "2026-05-11";
const EMPTY_ASSIGNMENT = "";
const REPOS_ASSIGNMENT = "REPOS";
const CAISSE_ASSIGNMENT = "CAISSE";
const GUICHET_ASSIGNMENT = "GUICHET";
const CONTROLE_ASSIGNMENT = "CONTROLE";
const NIGHT_COMBINED_ASSIGNMENT = "CAISSE/GUICHET";
const CAISSE_CONTROLE_ASSIGNMENT = "CAISSE/CONTROLE";
const EMPLOYEE_KEY_ALIASES = {
  YOUNESS: ["YOUNESS", "YOUNES"],
};
const NORMAL_REPOS_PREFERRED_DAY_OFFSETS = {
  FATIHA: [3, 4],
  HAYAT: [0, 1],
  MONCEF: [5, 6],
  YOUNESS: [2, 3],
  YOUNES: [2, 3],
  ABIRE: [5, 6],
  RAHMA: [6, 5],
  SAID: [0, 1],
  TAHRA: [1, 2],
};
const NORMAL_REPOS_REFERENCE_TARGETS = {
  FATIHA: 2,
  HAYAT: 2,
  MONCEF: 2,
  YOUNESS: 1,
  YOUNES: 1,
  ABIRE: 1,
  RAHMA: 1,
  SAID: 2,
  TAHRA: 2,
};
const SHIFT_CONTROL_REPLACEMENT_PRIORITY = [
  "YOUNESS BELHOUARI",
  "YOUNES BELHOUARI",
  "AYOUB LAHLALI",
  "SABER ABOABDALLAH",
];
const OFFICIAL_WEEKLY_PATTERNS = [
  {
    dayShifts: {
      Matin: {
        groupKey: "A",
        employees: {
          FATIHA: [
            CAISSE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
          ],
          HAYAT: [
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
          ],
          MONCEF: [
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
          ],
          AYOUB: [
            EMPTY_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
          ],
          YOUNESS: [
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            CAISSE_CONTROLE_ASSIGNMENT,
            CAISSE_CONTROLE_ASSIGNMENT,
          ],
        },
      },
      Soir: {
        groupKey: "B",
        employees: {
          ABIRE: [
            CAISSE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
          ],
          RAHMA: [
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            REPOS_ASSIGNMENT,
          ],
          SAID: [
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
          ],
          SABER: [
            CONTROLE_ASSIGNMENT,
            CONTROLE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
            EMPTY_ASSIGNMENT,
          ],
          TAHRA: [
            GUICHET_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            REPOS_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            GUICHET_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
            CAISSE_ASSIGNMENT,
          ],
        },
      },
    },
    nightShift: {
      employees: {
        AYOUB: [
          NIGHT_COMBINED_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
          REPOS_ASSIGNMENT,
          REPOS_ASSIGNMENT,
        ],
        SABER: [
          EMPTY_ASSIGNMENT,
          EMPTY_ASSIGNMENT,
          EMPTY_ASSIGNMENT,
          REPOS_ASSIGNMENT,
          REPOS_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
          NIGHT_COMBINED_ASSIGNMENT,
        ],
      },
    },
  },
];

function parsePositiveInt(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

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

function isMonday(dateString) {
  return parseUtcDate(dateString).getUTCDay() === 1;
}

function getWeekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

function getDaysDifference(startDate, endDate) {
  return Math.floor(
    (parseUtcDate(endDate).getTime() - parseUtcDate(startDate).getTime()) /
      MILLISECONDS_PER_DAY
  );
}

function getWeekOffsetFromAnchor(startDate) {
  return Math.floor(getDaysDifference(GROUP_ROTATION_ANCHOR_DATE, startDate) / 7);
}

function getGroupShiftRotation(startDate, groups, periods) {
  const groupA = findByNormalizedNames(groups, ["Groupe A", "Groupe 1"]);
  const groupB = findByNormalizedNames(groups, ["Groupe B", "Groupe 2"]);
  const matin = findByNormalizedName(periods, "Matin");
  const soir = findByNormalizedName(periods, "Soir");

  if (!groupA || !groupB || !matin || !soir) {
    throw new PlanningGenerationError(
      400,
      "Required groups Groupe A/Groupe B and periods Matin/Soir were not found for group shift rotation."
    );
  }

  const weekOffset = getWeekOffsetFromAnchor(startDate);
  const isAnchorRotation = modulo(weekOffset, 2) === 0;
  const groupARotationPeriod = isAnchorRotation ? matin : soir;
  const groupBRotationPeriod = isAnchorRotation ? soir : matin;
  const assignments = [
    {
      groupId: groupA.id,
      groupName: groupA.nom,
      periodId: groupARotationPeriod.id,
      periodName: groupARotationPeriod.nom,
    },
    {
      groupId: groupB.id,
      groupName: groupB.nom,
      periodId: groupBRotationPeriod.id,
      periodName: groupBRotationPeriod.nom,
    },
  ];

  return {
    anchorDate: GROUP_ROTATION_ANCHOR_DATE,
    startDate,
    weekOffset,
    byGroupId: assignments.reduce((result, assignment) => {
      result[assignment.groupId] = assignment;
      return result;
    }, {}),
    assignments,
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function rotateArray(items, offset) {
  if (items.length === 0) {
    return [];
  }

  const normalizedOffset = ((offset % items.length) + items.length) % items.length;

  return items.slice(normalizedOffset).concat(items.slice(0, normalizedOffset));
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function addWarning(warnings, message) {
  if (!warnings.includes(message)) {
    warnings.push(message);
  }
}

function buildMissingControlReplacementWarning(fixedController, date) {
  return `Aucun rempla\u00e7ant Contr\u00f4le disponible pour ${formatEmployeeName(
    fixedController
  )} le ${date}, mais le repos a \u00e9t\u00e9 conserv\u00e9.`;
}

function findByNormalizedName(rows, expectedName) {
  const normalizedExpectedName = normalizeText(expectedName);

  return rows.find((row) => normalizeText(row.nom) === normalizedExpectedName);
}

function findByNormalizedNames(rows, expectedNames) {
  for (const expectedName of expectedNames) {
    const row = findByNormalizedName(rows, expectedName);

    if (row) {
      return row;
    }
  }

  return null;
}

function employeeMatchesName(employee, expectedName) {
  const normalizedExpectedName = normalizeText(expectedName);

  return (
    normalizeText(employee.prenom) === normalizedExpectedName ||
    normalizeText(employee.nom) === normalizedExpectedName
  );
}

function formatEmployeeName(employee) {
  return `${employee.prenom} ${employee.nom}`.trim();
}

function findEmployeeByName(employees, expectedName) {
  return employees.find((employee) => employeeMatchesName(employee, expectedName)) || null;
}

function isShiftFixedControlEmployee(employee) {
  return Number(employee?.controle_fixe) === 1;
}

function idsMatch(leftId, rightId) {
  return Number(leftId) === Number(rightId);
}

function employeeIdSetHas(employeeIds, employeeId) {
  for (const candidateId of employeeIds) {
    if (idsMatch(candidateId, employeeId)) {
      return true;
    }
  }

  return false;
}

function buildEmployeeDateKey(employeeId, date) {
  return `${employeeId}|${date}`;
}

function buildReposKeySet(reposRows = []) {
  return new Set(
    reposRows.map((reposRow) =>
      buildEmployeeDateKey(reposRow.employe_id, reposRow._date)
    )
  );
}

function employeeHasReposOnDate(reposKeys, employeeId, date) {
  return Boolean(reposKeys?.has(buildEmployeeDateKey(employeeId, date)));
}

function buildActiveShiftNormalEmployees({
  activeGroup,
  employees,
  nightEmployee,
  restEmployeeIds,
  assignedEmployeeIds = new Set(),
}) {
  return employees.filter(
    (employee) =>
      idsMatch(employee.groupe_id, activeGroup.id) &&
      !isShiftFixedControlEmployee(employee) &&
      (!nightEmployee || !idsMatch(employee.id, nightEmployee.id)) &&
      !employeeIdSetHas(restEmployeeIds, employee.id) &&
      !employeeIdSetHas(assignedEmployeeIds, employee.id)
  );
}

function getExpectedFixedControlPeriod(periodName) {
  const normalizedPeriodName = normalizeText(periodName);

  if (normalizedPeriodName === normalizeText("Matin")) {
    return "Matin";
  }

  if (normalizedPeriodName === normalizeText("Soir")) {
    return "Soir";
  }

  return null;
}

function buildFixedControllersByPeriodId({ employees, matin, soir }) {
  const fixedControllersByPeriodId = {};
  const fixedControlRules = [
    { period: matin, controlePeriode: "Matin" },
    { period: soir, controlePeriode: "Soir" },
  ];

  for (const fixedControlRule of fixedControlRules) {
    const fixedControllers = employees.filter(
      (employee) =>
        Number(employee.controle_fixe) === 1 &&
        normalizeText(employee.controle_periode) ===
          normalizeText(fixedControlRule.controlePeriode)
    );

    if (fixedControllers.length !== 1) {
      throw new PlanningGenerationError(
        400,
        `Exactly one active employee must have controle_fixe = 1 and controle_periode = '${fixedControlRule.controlePeriode}' for ${fixedControlRule.period.nom} Controle. Found ${fixedControllers.length}.`
      );
    }

    fixedControllersByPeriodId[fixedControlRule.period.id] = fixedControllers[0];
  }

  return fixedControllersByPeriodId;
}

function addConfigError(errors, message) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isNightWorkAuthorized(employee, hasNightAuthorization) {
  return hasNightAuthorization && Number(employee.travail_nuit_autorise) === 1;
}

function validateEmployeePlanningConfig(employees, hasNightAuthorization) {
  const errors = getEmployeePlanningConfigErrors(
    employees,
    hasNightAuthorization
  );

  if (errors.length > 0) {
    const error = new PlanningGenerationError(
      422,
      `Configuration de planning des employés invalide. ${errors.join(" | ")}`
    );

    error.errors = errors;
    throw error;
  }
}

function getEmployeePlanningConfigErrors(employees, hasNightAuthorization) {
  const errors = [];
  const matinFixedControls = employees.filter(
    (employee) =>
      Number(employee.controle_fixe) === 1 &&
      normalizeText(employee.controle_periode) === normalizeText("Matin")
  );
  const soirFixedControls = employees.filter(
    (employee) =>
      Number(employee.controle_fixe) === 1 &&
      normalizeText(employee.controle_periode) === normalizeText("Soir")
  );
  const nightOrderByValue = new Map();
  const nightCapableEmployees = [];

  if (matinFixedControls.length !== 1) {
    addConfigError(
      errors,
      `Exactly one active Matin fixed control is required, found ${matinFixedControls.length}.`
    );
  }

  if (soirFixedControls.length !== 1) {
    addConfigError(
      errors,
      `Exactly one active Soir fixed control is required, found ${soirFixedControls.length}.`
    );
  }

  for (const employee of employees) {
    const employeeName = formatEmployeeName(employee);
    const authorizedForNight = isNightWorkAuthorized(
      employee,
      hasNightAuthorization
    );
    const isFixedControl = Number(employee.controle_fixe) === 1;
    const hasNightOrder = hasValue(employee.ordre_nuit);
    const normalizedReposBaseTarget = String(employee.repos_base_target || "").trim();
    const normalizedControlPeriod = normalizeText(employee.controle_periode);

    if (!["1j", "2j"].includes(normalizedReposBaseTarget)) {
      addConfigError(
        errors,
        normalizedReposBaseTarget
          ? `Employee ${employeeName} has invalid repos_base_target '${normalizedReposBaseTarget}'.`
          : `Employee ${employeeName} is missing repos_base_target.`
      );
    }

    if (employee.sexe === "Femme" && authorizedForNight) {
      addConfigError(
        errors,
        `Female employee ${employeeName} cannot be authorized for night work.`
      );
    }

    if (isFixedControl && authorizedForNight) {
      addConfigError(
        errors,
        `Fixed control ${employeeName} cannot be authorized for night work.`
      );
    }

    if (isFixedControl && !["MATIN", "SOIR"].includes(normalizedControlPeriod)) {
      addConfigError(
        errors,
        `Fixed control ${employeeName} must have controle_periode 'Matin' or 'Soir'.`
      );
    }

    if (!isFixedControl && hasValue(employee.controle_periode)) {
      addConfigError(
        errors,
        `Employee ${employeeName} has controle_periode set but is not a fixed control.`
      );
    }

    if (!authorizedForNight && hasNightOrder) {
      addConfigError(
        errors,
        `Employee ${employeeName} has ordre_nuit set but is not authorized for night work.`
      );
    }

    if (
      authorizedForNight &&
      !isFixedControl &&
      employee.sexe === "Homme"
    ) {
      if (!hasNightOrder) {
        addConfigError(
          errors,
          `Night-capable employee ${employeeName} must have ordre_nuit set.`
        );
      } else {
        nightCapableEmployees.push(employee);
        const ordreNuit = Number(employee.ordre_nuit);

        if (nightOrderByValue.has(ordreNuit)) {
          addConfigError(
            errors,
            `Duplicate ordre_nuit ${ordreNuit} found for ${formatEmployeeName(
              nightOrderByValue.get(ordreNuit)
            )} and ${employeeName}.`
          );
        } else {
          nightOrderByValue.set(ordreNuit, employee);
        }
      }
    }
  }

  if (nightCapableEmployees.length < 2) {
    addConfigError(
      errors,
      `Au moins 2 employés hommes actifs autorisés à travailler la nuit sont requis. Trouvé : ${nightCapableEmployees.length}.`
    );
  }

  return errors;
}

function canResolveShiftFixedControlsForDate({
  date,
  restEmployeeIds,
  nightEmployee,
  groups,
  employees,
  employeesByGroupId,
  activePeriodsByGroupId,
  fixedControllersByPeriodId,
  roleIds,
}) {
  const assignedEmployeeIds = new Set(nightEmployee ? [nightEmployee.id] : []);

  for (const periodId of [roleIds.matinPeriodId, roleIds.soirPeriodId]) {
    const fixedController = fixedControllersByPeriodId[periodId];
    const activeGroup = getActiveGroupForPeriod(
      groups,
      activePeriodsByGroupId,
      periodId
    );

    if (!fixedController || !activeGroup) {
      return false;
    }

    const activeShiftEmployees = buildActiveShiftNormalEmployees({
      activeGroup,
      employees: employeesByGroupId[activeGroup.id] || [],
      nightEmployee,
      restEmployeeIds,
      assignedEmployeeIds,
    });

    if (
      !employeeIdSetHas(restEmployeeIds, fixedController.id) &&
      (!nightEmployee || !idsMatch(fixedController.id, nightEmployee.id)) &&
      !employeeIdSetHas(assignedEmployeeIds, fixedController.id)
    ) {
      if (activeShiftEmployees.length + 1 < 3) {
        return false;
      }

      assignedEmployeeIds.add(fixedController.id);
      continue;
    }

    if (activeShiftEmployees.length < 3) {
      return false;
    }

    const replacement = findControlReplacement({
      activeShiftEmployees,
      fixedController,
      nightEmployee,
      restEmployeeIds,
      assignedEmployeeIds,
    });

    if (!replacement) {
      return false;
    }

    assignedEmployeeIds.add(replacement.id);
  }

  return true;
}

function unusedFindFixedControllerForGroup(group, groupEmployees) {
  return null;
/*
  const expectedFixedControlName = getExpectedFixedControlNameForGroup(group);

  if (!expectedFixedControlName) {
    throw new PlanningGenerationError(
      400,
      `No fixed Contrôle rule is configured for ${group.nom}.`
    );
  }

  const fixedController = groupEmployees.find(
    (employee) =>
      employeeMatchesName(employee, expectedFixedControlName) &&
      Number(employee.controle_fixe) === 1
  );

  if (!fixedController) {
    throw new PlanningGenerationError(
      400,
      `${expectedFixedControlName} must exist in ${group.nom} with controle_fixe = 1.`
    );
  }

  return fixedController;
*/
}

function isValidControlReplacement({
  employee,
  fixedController,
  nightEmployee,
  restEmployeeIds,
  assignedEmployeeIds = new Set(),
}) {
  if (!employee || !fixedController) {
    return false;
  }

  if (idsMatch(employee.id, fixedController.id)) {
    return false;
  }

  if (employee.sexe !== "Homme") {
    return false;
  }

  if (isShiftFixedControlEmployee(employee)) {
    return false;
  }

  if (employeeIdSetHas(restEmployeeIds, employee.id)) {
    return false;
  }

  if (nightEmployee && idsMatch(employee.id, nightEmployee.id)) {
    return false;
  }

  if (employeeIdSetHas(assignedEmployeeIds, employee.id)) {
    return false;
  }

  return true;
}

function compareControlReplacementPriority(left, right) {
  const priorityDifference =
    getShiftControlReplacementPriority(left) -
    getShiftControlReplacementPriority(right);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return Number(left.id) - Number(right.id);
}

function findControlReplacement({
  activeShiftEmployees = [],
  fixedController,
  nightEmployee,
  restEmployeeIds,
  assignedEmployeeIds = new Set(),
}) {
  return (
    activeShiftEmployees
      .filter((employee) =>
        isValidControlReplacement({
          employee,
          fixedController,
          nightEmployee,
          restEmployeeIds,
          assignedEmployeeIds,
        })
      )
      .sort(compareControlReplacementPriority)[0] || null
  );
}

function getFixedControlPeriodIdForEmployee(employee, fixedControllersByPeriodId) {
  if (!employee || !fixedControllersByPeriodId) {
    return null;
  }

  const matchingEntry = Object.entries(fixedControllersByPeriodId).find(
    ([, fixedController]) => idsMatch(fixedController.id, employee.id)
  );

  return matchingEntry ? Number(matchingEntry[0]) : null;
}

function getActiveGroupForPeriod(groups, activePeriodsByGroupId, periodId) {
  return groups.find((group) =>
    idsMatch(activePeriodsByGroupId[group.id], periodId)
  ) || null;
}

function getReservedControlReplacementIds(controlContext, date) {
  return controlContext?.reservedControlReplacementIdsByDate?.get(date) || new Set();
}

function reserveControlReplacementId(controlContext, date, employeeId) {
  if (!controlContext?.reservedControlReplacementIdsByDate) {
    return;
  }

  if (!controlContext.reservedControlReplacementIdsByDate.has(date)) {
    controlContext.reservedControlReplacementIdsByDate.set(date, new Set());
  }

  controlContext.reservedControlReplacementIdsByDate.get(date).add(employeeId);
}

function snapshotReservedControlReplacements(controlContext) {
  return new Map(
    [...(controlContext?.reservedControlReplacementIdsByDate || new Map()).entries()]
      .map(([date, employeeIds]) => [date, new Set(employeeIds)])
  );
}

function restoreReservedControlReplacements(controlContext, snapshot) {
  if (!controlContext?.reservedControlReplacementIdsByDate) {
    return;
  }

  controlContext.reservedControlReplacementIdsByDate.clear();
  snapshot.forEach((employeeIds, date) => {
    controlContext.reservedControlReplacementIdsByDate.set(date, new Set(employeeIds));
  });
}

function findFixedShiftControlReplacementForRest({
  fixedController,
  date,
  restEmployeeIds,
  nightEmployee,
  controlContext,
}) {
  const periodId = getFixedControlPeriodIdForEmployee(
    fixedController,
    controlContext?.fixedControllersByPeriodId
  );

  if (!periodId) {
    return null;
  }

  const activeGroup = getActiveGroupForPeriod(
    controlContext.groups,
    controlContext.activePeriodsByGroupId,
    periodId
  );

  if (!activeGroup) {
    return null;
  }

  const reservedReplacementIds = getReservedControlReplacementIds(controlContext, date);
  const assignedEmployeeIds = new Set([
    ...reservedReplacementIds,
    ...(nightEmployee ? [nightEmployee.id] : []),
  ]);
  const globalPreassignedReposRows = controlContext?.globalPreassignedReposRows || [];
  const globalPreassignedRestEmployeeIds = globalPreassignedReposRows
    .filter((reposRow) => reposRow._date === date)
    .map((reposRow) => reposRow.employe_id);
  const unavailableRestEmployeeIds = new Set([
    ...restEmployeeIds,
    ...globalPreassignedRestEmployeeIds,
  ]);
  const activeShiftEmployees = buildActiveShiftNormalEmployees({
    activeGroup,
    employees: controlContext.employeesByGroupId[activeGroup.id] || [],
    nightEmployee,
    restEmployeeIds: unavailableRestEmployeeIds,
    assignedEmployeeIds,
  });

  return findControlReplacement({
    activeShiftEmployees,
    fixedController,
    nightEmployee,
    restEmployeeIds: unavailableRestEmployeeIds,
    assignedEmployeeIds,
  });
}

function getRotationType(weekNumber) {
  return ((weekNumber - 1) % 2) + 1;
}

function getPlanningWeekNumber(startDate) {
  const daysDiff = getDaysDifference(PLANNING_WEEK_ANCHOR_DATE, startDate);

  if (daysDiff < 0) {
    throw new PlanningGenerationError(
      400,
      `startDate must be on or after planning cycle anchor date ${PLANNING_WEEK_ANCHOR_DATE}.`
    );
  }

  return Math.floor(daysDiff / 7) + 1;
}

function getRestPatternWeekOffset(startDate) {
  const daysDiff = getDaysDifference(REST_PATTERN_ANCHOR_DATE, startDate);

  if (daysDiff < 0) {
    throw new PlanningGenerationError(
      400,
      `startDate must be on or after repos pattern anchor date ${REST_PATTERN_ANCHOR_DATE}.`
    );
  }

  return Math.floor(daysDiff / 7);
}

function getRestDaysTarget(employee, startDate) {
  const normalizedBaseTarget = String(employee.repos_base_target || "").trim();

  if (!normalizedBaseTarget) {
    throw new PlanningGenerationError(
      400,
      `Missing repos_base_target for active employee ${formatEmployeeName(employee)}.`
    );
  }

  if (!["1j", "2j"].includes(normalizedBaseTarget)) {
    throw new PlanningGenerationError(
      400,
      `Invalid repos_base_target '${normalizedBaseTarget}' for active employee ${formatEmployeeName(employee)}. Expected '1j' or '2j'.`
    );
  }

  const baseTarget = normalizedBaseTarget === "1j" ? 1 : 2;
  const weekOffset = getRestPatternWeekOffset(startDate);

  if (weekOffset % 2 === 0) {
    return baseTarget;
  }

  return baseTarget === 1 ? 2 : 1;
}

function buildAlternatingRoleIds(count, seed, roleIds) {
  return Array.from({ length: count }, () => roleIds.guichet);
}

async function hasNightAuthorizationColumn(connection) {
  const [rows] = await connection.query(
    "SHOW COLUMNS FROM employes LIKE 'travail_nuit_autorise'"
  );

  return rows.length > 0;
}

async function fetchEmployees(connection, includeNightAuthorization) {
  const nightColumnSelect = includeNightAuthorization
    ? ", e.travail_nuit_autorise"
    : "";

  const [rows] = await connection.query(
    `
      SELECT
        e.id,
        e.prenom,
        e.nom,
        e.sexe,
        e.groupe_id,
        e.actif,
        e.controle_fixe,
        e.repos_base_target,
        e.ordre_nuit,
        e.controle_periode_id,
        pt.nom AS controle_periode,
        g.nom AS groupe
        ${nightColumnSelect}
      FROM employes e
      JOIN groupes g ON g.id = e.groupe_id
      LEFT JOIN periodes_travail pt ON pt.id = e.controle_periode_id
      WHERE e.actif = TRUE
      ORDER BY e.groupe_id ASC, e.id ASC
    `
  );

  return rows;
}

function isEligibleNightEmployee(employee, hasNightAuthorization) {
  if (employee.sexe !== "Homme") {
    return false;
  }

  if (Number(employee.controle_fixe) === 1) {
    return false;
  }

  if (employee.ordre_nuit === null || employee.ordre_nuit === undefined) {
    return false;
  }

  if (
    hasNightAuthorization &&
    Number(employee.travail_nuit_autorise) !== 1
  ) {
    return false;
  }

  return true;
}

function buildNightCandidates(employees, hasNightAuthorization, warnings) {
  if (!hasNightAuthorization) {
    addWarning(
      warnings,
      "La colonne employes.travail_nuit_autorise est absente. L'autorisation de travail de nuit n'a pas \u00e9t\u00e9 v\u00e9rifi\u00e9e pour les candidats au service de nuit."
    );
  }

  const nightCandidates = employees
    .filter((employee) => isEligibleNightEmployee(employee, hasNightAuthorization))
    .sort((left, right) => {
      const orderDiff = Number(left.ordre_nuit) - Number(right.ordre_nuit);

      if (orderDiff !== 0) {
        return orderDiff;
      }

      return Number(left.id) - Number(right.id);
    });

  if (nightCandidates.length < 2) {
    throw new PlanningGenerationError(
      400,
      `At least 2 active night-capable employees are required. Found ${nightCandidates.length}. Employees must have actif = true, travail_nuit_autorise = true, controle_fixe = false, sexe = 'Homme' and ordre_nuit set.`
    );
  }

  return nightCandidates;
}

function getNightBlockForDate(date, nightWorkers) {
  if (!Array.isArray(nightWorkers) || nightWorkers.length === 0) {
    throw new PlanningGenerationError(
      400,
      "At least one night worker is required to calculate the night cycle."
    );
  }

  const daysSinceAnchor = getDaysDifference(NIGHT_CYCLE_ANCHOR_SATURDAY, date);
  const blockIndex = Math.floor(daysSinceAnchor / NIGHT_BLOCK_LENGTH_DAYS);
  const worker = nightWorkers[modulo(blockIndex, nightWorkers.length)];
  const blockStart = addDays(
    NIGHT_CYCLE_ANCHOR_SATURDAY,
    blockIndex * NIGHT_BLOCK_LENGTH_DAYS
  );
  const blockEnd = addDays(blockStart, NIGHT_BLOCK_LENGTH_DAYS - 1);

  return {
    date,
    blockIndex,
    blockStart,
    blockEnd,
    worker: {
      id: worker.id,
      name: formatEmployeeName(worker),
      ordre_nuit: worker.ordre_nuit,
    },
  };
}

function getNightAssignmentsForWeek(weekDates, nightWorkers) {
  return weekDates.map((date) => getNightBlockForDate(date, nightWorkers));
}

function getNightBoundaryReposForBlock(block, weekDates = []) {
  const weekDateSet = new Set(weekDates);
  const boundaryRepos = [
    {
      reposDate: addDays(block.blockStart, -2),
      reason: "before_nuit",
    },
    {
      reposDate: addDays(block.blockStart, -1),
      reason: "before_nuit",
    },
    {
      reposDate: addDays(block.blockEnd, 1),
      reason: "after_nuit",
    },
    {
      reposDate: addDays(block.blockEnd, 2),
      reason: "after_nuit",
    },
  ];

  return boundaryRepos.map((reposRow) => ({
    employe_id: block.worker.id,
    employeeName: block.worker.name,
    ordre_nuit: block.worker.ordre_nuit,
    reposDate: reposRow.reposDate,
    reason: reposRow.reason,
    blockIndex: block.blockIndex,
    blockStart: block.blockStart,
    blockEnd: block.blockEnd,
    insideWeek: weekDateSet.has(reposRow.reposDate),
  }));
}

function getNightReposForWeek(weekDates, nightWorkers) {
  const blockIndexes = new Set();

  for (const date of weekDates) {
    const block = getNightBlockForDate(date, nightWorkers);

    blockIndexes.add(block.blockIndex);
  }

  return [...blockIndexes]
    .sort((left, right) => left - right)
    .flatMap((blockIndex) => {
      const blockStart = addDays(
        NIGHT_CYCLE_ANCHOR_SATURDAY,
        blockIndex * NIGHT_BLOCK_LENGTH_DAYS
      );
      const block = getNightBlockForDate(blockStart, nightWorkers);

      return getNightBoundaryReposForBlock(block, weekDates).filter(
        (reposRow) => reposRow.insideWeek
      );
    });
}

function getNormalReposTargetForWeek(employee, weekStartDate) {
  const employeeKey = normalizeText(employee.prenom).split(/\s+/)[0] || "";
  const referenceTarget = NORMAL_REPOS_REFERENCE_TARGETS[employeeKey];
  const normalizedBaseTarget = String(employee.repos_base_target || "").trim();

  if (![1, 2].includes(referenceTarget) && !["1j", "2j"].includes(normalizedBaseTarget)) {
    throw new PlanningGenerationError(
      400,
      `Invalid repos_base_target '${normalizedBaseTarget}' for active employee ${formatEmployeeName(employee)}. Expected '1j' or '2j'.`
    );
  }

  const baseTarget = referenceTarget || (normalizedBaseTarget === "2j" ? 2 : 1);
  const weekOffset = Math.floor(
    getDaysDifference(NORMAL_REPOS_ANCHOR_DATE, weekStartDate) / 7
  );

  if (modulo(weekOffset, 2) === 0) {
    return baseTarget;
  }

  return baseTarget === 1 ? 2 : 1;
}

function getPreferredNormalReposDates(employee, weekDates) {
  const employeeKey = normalizeText(employee.prenom).split(/\s+/)[0] || "";
  const preferredOffsets =
    NORMAL_REPOS_PREFERRED_DAY_OFFSETS[employeeKey] ||
    rotateArray(
      Array.from({ length: weekDates.length }, (_, index) => index),
      Number(employee.id) % weekDates.length
    );

  return [
    ...preferredOffsets,
    ...Array.from({ length: weekDates.length }, (_, index) => index),
  ]
    .filter((offset, index, offsets) => offsets.indexOf(offset) === index)
    .map((offset) => weekDates[offset])
    .filter(Boolean);
}

function getNormalReposForWeek(weekDates, employees, nightWorkers, nightRepos = []) {
  const weekStartDate = weekDates[0];
  const nightWorkerIds = new Set(nightWorkers.map((worker) => Number(worker.id)));
  const nightAssignmentsByEmployeeDate = new Set(
    getNightAssignmentsForWeek(weekDates, nightWorkers).map(
      (assignment) => `${assignment.worker.id}|${assignment.date}`
    )
  );
  const nightReposByEmployeeDate = new Set(
    nightRepos
      .filter((reposRow) => reposRow.insideWeek)
      .map((reposRow) => `${reposRow.employe_id}|${reposRow.reposDate}`)
  );

  return employees
    .filter((employee) => Number(employee.actif) === 1)
    .map((employee) => {
      const isNightWorker = nightWorkerIds.has(Number(employee.id));

      if (isNightWorker) {
        return {
          employe_id: employee.id,
          employeeName: formatEmployeeName(employee),
          groupName: employee.groupe,
          targetReposCount: 0,
          reposDates: [],
          reason: "normal_repos",
          excluded: true,
          exclusionReason: "night_cycle",
        };
      }

      const targetReposCount = getNormalReposTargetForWeek(employee, weekStartDate);
      const reposDates = [];

      for (const date of getPreferredNormalReposDates(employee, weekDates)) {
        const employeeDateKey = `${employee.id}|${date}`;

        if (nightAssignmentsByEmployeeDate.has(employeeDateKey)) {
          continue;
        }

        if (nightReposByEmployeeDate.has(employeeDateKey)) {
          continue;
        }

        reposDates.push(date);

        if (reposDates.length >= targetReposCount) {
          break;
        }
      }

      return {
        employe_id: employee.id,
        employeeName: formatEmployeeName(employee),
        groupName: employee.groupe,
        targetReposCount,
        reposDates,
        reason: "normal_repos",
        excluded: false,
      };
    });
}

function buildUnavailableEmployeeDateSet({
  nightAssignments = [],
  nightRepos = [],
  normalRepos = [],
}) {
  const unavailable = new Map();

  function addUnavailable(employeeId, date, reason) {
    const key = buildEmployeeDateKey(employeeId, date);
    const reasons = unavailable.get(key) || new Set();

    reasons.add(reason);
    unavailable.set(key, reasons);
  }

  nightAssignments.forEach((assignment) => {
    addUnavailable(assignment.worker.id, assignment.date, "nuit");
  });
  nightRepos
    .filter((reposRow) => reposRow.insideWeek)
    .forEach((reposRow) => {
      addUnavailable(reposRow.employe_id, reposRow.reposDate, reposRow.reason);
    });
  normalRepos.forEach((reposRow) => {
    reposRow.reposDates.forEach((date) => {
      addUnavailable(reposRow.employe_id, date, reposRow.reason);
    });
  });

  return unavailable;
}

function isEmployeeUnavailableForDayShift(employee, date, unavailableByEmployeeDate) {
  return unavailableByEmployeeDate.has(buildEmployeeDateKey(employee.id, date));
}

function getUnavailableReasons(employee, date, unavailableByEmployeeDate) {
  return [
    ...(unavailableByEmployeeDate.get(buildEmployeeDateKey(employee.id, date)) ||
      []),
  ];
}

function getFixedControlForGroup(group, employees) {
  const expectedNameByGroup = {
    "GROUPE A": "MONCEF EL AMRI",
    "GROUPE B": "SAID NACER",
  };
  const expectedName = expectedNameByGroup[normalizeText(group.nom)];
  const candidates = employees.filter(
    (employee) =>
      Number(employee.groupe_id) === Number(group.id) &&
      Number(employee.controle_fixe) === 1
  );

  if (expectedName) {
    return (
      candidates.find(
        (employee) => normalizeText(formatEmployeeName(employee)) === expectedName
      ) || null
    );
  }

  return candidates[0] || null;
}

function getFixedControlForPeriod(period, employees) {
  const expectedNameByPeriod = {
    MATIN: "MONCEF EL AMRI",
    SOIR: "SAID NACER",
  };
  const expectedName = expectedNameByPeriod[normalizeText(period?.nom)];

  if (!expectedName) {
    return null;
  }

  return (
    employees.find(
      (employee) =>
        Number(employee.controle_fixe) === 1 &&
        normalizeText(formatEmployeeName(employee)) === expectedName
    ) || null
  );
}

function findSameGroupMaleControlReplacement({
  group,
  employees,
  date,
  unavailableByEmployeeDate,
  assignedEmployeeIds = new Set(),
}) {
  return employees
    .filter(
      (employee) =>
        Number(employee.groupe_id) === Number(group.id) &&
        employee.sexe === "Homme" &&
        Number(employee.controle_fixe) !== 1 &&
        !employeeIdSetHas(assignedEmployeeIds, employee.id) &&
        !isEmployeeUnavailableForDayShift(
          employee,
          date,
          unavailableByEmployeeDate
        )
    )
    .sort((left, right) => Number(left.id) - Number(right.id))[0] || null;
}

function getShiftControlReplacementPriority(employee) {
  const normalizedName = normalizeText(formatEmployeeName(employee));
  const priorityIndex = SHIFT_CONTROL_REPLACEMENT_PRIORITY.indexOf(normalizedName);

  return priorityIndex === -1 ? Number.MAX_SAFE_INTEGER : priorityIndex;
}

function findShiftMaleControlReplacement({
  shiftEmployees = [],
  fixedController,
  date,
  unavailableByEmployeeDate,
  assignedEmployeeIds = new Set(),
}) {
  return (
    shiftEmployees
      .filter(
        (employee) =>
          employee &&
          Number(employee.actif) === 1 &&
          employee.sexe === "Homme" &&
          Number(employee.controle_fixe) !== 1 &&
          (!fixedController || !idsMatch(employee.id, fixedController.id)) &&
          !employeeIdSetHas(assignedEmployeeIds, employee.id) &&
          !isEmployeeUnavailableForDayShift(
            employee,
            date,
            unavailableByEmployeeDate
          )
      )
      .sort(compareControlReplacementPriority)[0] || null
  );
}

function buildDynamicDayShiftAssignments({
  weekDates,
  employees,
  groupRotation,
  roles,
  nightAssignments,
  nightRepos,
  normalRepos,
}) {
  const guichet = findByNormalizedName(roles, "Guichet");
  const controle =
    findByNormalizedNames(roles, ["Contrôle", "Controle"]) ||
    roles.find((role) => normalizeText(role.nom).startsWith("CONTROLE"));

  if (!guichet || !controle) {
    throw new PlanningGenerationError(
      400,
      "Required roles Guichet and Contrôle were not found for dynamic day-shift assignment."
    );
  }

  const unavailableByEmployeeDate = buildUnavailableEmployeeDateSet({
    nightAssignments,
    nightRepos,
    normalRepos,
  });
  const groupsById = groupRotation.assignments.reduce((result, assignment) => {
    result[assignment.groupId] = {
      id: assignment.groupId,
      nom: assignment.groupName,
    };
    return result;
  }, {});
  const employeesById = employees.reduce((result, employee) => {
    result[employee.id] = employee;
    return result;
  }, {});
  const rows = [];
  const rowKeys = new Set();
  const warnings = [];
  const transferEvents = [];
  const periodById = groupRotation.assignments.reduce((result, assignment) => {
    result[assignment.periodId] = {
      id: assignment.periodId,
      nom: assignment.periodName,
    };
    return result;
  }, {});

  function addRow(row) {
    const rowKey = `${row.employe_id}|${row.date}|${row.periodId}`;

    if (rowKeys.has(rowKey)) {
      throw new PlanningGenerationError(
        400,
        `Dynamic day-shift assignment duplicated ${row.employeeName} on ${row.date} for ${row.periodName}.`
      );
    }

    rowKeys.add(rowKey);
    rows.push(row);
  }

  function removeRow(row) {
    const rowIndex = rows.indexOf(row);

    if (rowIndex === -1) {
      return;
    }

    rowKeys.delete(`${row.employe_id}|${row.date}|${row.periodId}`);
    rows.splice(rowIndex, 1);
  }

  function getOppositeShiftPeriodId(periodId) {
    if (idsMatch(periodId, groupRotation.assignments[0]?.periodId)) {
      return groupRotation.assignments[1]?.periodId || null;
    }

    if (idsMatch(periodId, groupRotation.assignments[1]?.periodId)) {
      return groupRotation.assignments[0]?.periodId || null;
    }

    return null;
  }

  function isForbiddenTransferDirection(employee, targetPeriodName) {
    const employeeName = normalizeText(formatEmployeeName(employee));
    const normalizedTargetPeriod = normalizeText(targetPeriodName);

    return (
      (employeeName === "MONCEF EL AMRI" && normalizedTargetPeriod === "SOIR") ||
      (employeeName === "SAID NACER" && normalizedTargetPeriod === "MATIN")
    );
  }

  function findCrossShiftControlTransferCandidate({
    date,
    targetPeriodId,
    targetPeriodName,
  }) {
    const oppositePeriodId = getOppositeShiftPeriodId(targetPeriodId);

    if (!oppositePeriodId) {
      return null;
    }

    const candidates = rows
      .filter(
        (row) =>
          row.date === date &&
          idsMatch(row.periodId, oppositePeriodId) &&
          idsMatch(row.roleId, guichet.id)
      )
      .map((row) => ({
        row,
        employee: employeesById[row.employe_id],
      }))
      .filter(({ row, employee }) => {
        if (!employee) {
          return false;
        }

        if (employee.sexe !== "Homme" || Number(employee.actif) !== 1) {
          return false;
        }

        if (Number(employee.controle_fixe) === 1) {
          return false;
        }

        if (isForbiddenTransferDirection(employee, targetPeriodName)) {
          return false;
        }

        if (
          isEmployeeUnavailableForDayShift(
            employee,
            date,
            unavailableByEmployeeDate
          )
        ) {
          return false;
        }

        const employeeRowsForDate = rows.filter(
          (candidateRow) =>
            candidateRow.date === date &&
            idsMatch(candidateRow.employe_id, employee.id)
        );

        return employeeRowsForDate.length === 1 && employeeRowsForDate[0] === row;
      })
      .sort((left, right) =>
        compareControlReplacementPriority(left.employee, right.employee)
      );

    return candidates[0] || null;
  }

  for (const date of weekDates) {
    const assignedEmployeeIds = new Set();

    for (const rotationAssignment of groupRotation.assignments) {
      const group = groupsById[rotationAssignment.groupId];
      const groupEmployees = employees.filter(
        (employee) => Number(employee.groupe_id) === Number(group.id)
      );
      const period = periodById[rotationAssignment.periodId];
      const fixedControl = getFixedControlForPeriod(period, employees);
      const fixedControlGroup = fixedControl
        ? groupsById[fixedControl.groupe_id] || {
            id: fixedControl.groupe_id,
            nom: fixedControl.groupe,
          }
        : group;
      let controlEmployee = null;
      let replacementFor = null;
      let debugReason = "fixed_control";

      if (
        fixedControl &&
        !employeeIdSetHas(assignedEmployeeIds, fixedControl.id) &&
        !isEmployeeUnavailableForDayShift(
          fixedControl,
          date,
          unavailableByEmployeeDate
        )
      ) {
        controlEmployee = fixedControl;
      }

      if (controlEmployee) {
        addRow({
          employe_id: controlEmployee.id,
          employeeName: formatEmployeeName(controlEmployee),
          date,
          groupId: controlEmployee.groupe_id,
          groupName: controlEmployee.groupe || fixedControlGroup.nom,
          periodId: rotationAssignment.periodId,
          periodName: rotationAssignment.periodName,
          roleId: controle.id,
          roleName: "Contrôle",
          debugReason,
          replacementFor,
        });
        assignedEmployeeIds.add(controlEmployee.id);
      }

      const availableNormalEmployees = groupEmployees.filter(
        (employee) =>
          Number(employee.controle_fixe) !== 1 &&
          !employeeIdSetHas(assignedEmployeeIds, employee.id) &&
          !isEmployeeUnavailableForDayShift(
            employee,
            date,
            unavailableByEmployeeDate
          )
      );

      if (!controlEmployee) {
        controlEmployee = findShiftMaleControlReplacement({
          shiftEmployees: availableNormalEmployees,
          fixedController: fixedControl,
          date,
          unavailableByEmployeeDate,
          assignedEmployeeIds,
        });
        replacementFor = fixedControl ? formatEmployeeName(fixedControl) : null;
        debugReason = "control_replacement";

        if (controlEmployee) {
          addRow({
            employe_id: controlEmployee.id,
            employeeName: formatEmployeeName(controlEmployee),
            date,
            groupId: controlEmployee.groupe_id,
            groupName: controlEmployee.groupe || group.nom,
            periodId: rotationAssignment.periodId,
            periodName: rotationAssignment.periodName,
            roleId: controle.id,
            roleName: "Contrôle",
            debugReason,
            replacementFor,
          });
          assignedEmployeeIds.add(controlEmployee.id);
        } else {
          const transferCandidate = findCrossShiftControlTransferCandidate({
            date,
            targetPeriodId: rotationAssignment.periodId,
            targetPeriodName: rotationAssignment.periodName,
          });

          if (transferCandidate) {
            const originalRow = transferCandidate.row;

            controlEmployee = transferCandidate.employee;
            removeRow(originalRow);
            addRow({
              employe_id: controlEmployee.id,
              employeeName: formatEmployeeName(controlEmployee),
              date,
              groupId: controlEmployee.groupe_id,
              groupName: controlEmployee.groupe || group.nom,
              periodId: rotationAssignment.periodId,
              periodName: rotationAssignment.periodName,
              roleId: controle.id,
              roleName: "Contrôle",
              debugReason: "control_cross_shift_transfer",
              replacementFor,
              transferredFromPeriodId: originalRow.periodId,
              transferredFromPeriodName: originalRow.periodName,
              display_status: "REPLACEMENT_CONTROL",
              transfer_type: "CROSS_SHIFT_CONTROL",
              source_period: originalRow.periodName,
              target_period: rotationAssignment.periodName,
              source_role: "Guichet",
              target_role: "Controle",
              transferred_from_period: originalRow.periodName,
              transferred_to_period: rotationAssignment.periodName,
            });
            transferEvents.push({
              date,
              employe_id: controlEmployee.id,
              employeeId: controlEmployee.id,
              employeeName: formatEmployeeName(controlEmployee),
              prenom: controlEmployee.prenom,
              nom: controlEmployee.nom,
              groupe: controlEmployee.groupe || group.nom,
              groupName: controlEmployee.groupe || group.nom,
              fromPeriodId: originalRow.periodId,
              fromPeriodName: originalRow.periodName,
              source_period: originalRow.periodName,
              source_role: "Guichet",
              toPeriodId: rotationAssignment.periodId,
              toPeriodName: rotationAssignment.periodName,
              target_period: rotationAssignment.periodName,
              display_status: "TRANSFERRED_OUT",
              label: "Transfere",
              reason: "control_cross_shift_transfer",
              debugReason: "control_cross_shift_transfer",
              target_role: "Controle",
              roleName: "Contrôle",
            });
          } else {
            warnings.push(
              `${date} ${rotationAssignment.periodName}: aucun Contrôle disponible.`
            );
          }
        }
      }

      availableNormalEmployees.forEach((employee) => {
        if (controlEmployee && idsMatch(employee.id, controlEmployee.id)) {
          return;
        }

        addRow({
          employe_id: employee.id,
          employeeName: formatEmployeeName(employee),
          date,
          groupId: group.id,
          groupName: group.nom,
          periodId: rotationAssignment.periodId,
          periodName: rotationAssignment.periodName,
          roleId: guichet.id,
          roleName: "Guichet",
          debugReason: "available_day_shift",
        });
        assignedEmployeeIds.add(employee.id);
      });
    }
  }

  return {
    rows,
    warnings,
    transferEvents,
    unavailableByEmployeeDate,
  };
}

function buildDynamicPlanningRows({
  nightAssignments,
  dayShiftAssignments,
  nuit,
  guichet,
}) {
  const rows = [];
  const rowKeys = new Set();

  function addRow(row, label) {
    const rowKey = `${row.employe_id}|${row._date}|${row.periode_id}`;

    if (rowKeys.has(rowKey)) {
      throw new PlanningGenerationError(
        400,
        `Dynamic generator duplicated ${label} on ${row._date}.`
      );
    }

    rowKeys.add(rowKey);
    rows.push(row);
  }

  nightAssignments.forEach((assignment) => {
    addRow(
      {
        employe_id: assignment.worker.id,
        _date: assignment.date,
        periode_id: nuit.id,
        role_travail_id: guichet.id,
      },
      assignment.worker.name
    );
  });

  dayShiftAssignments.rows.forEach((row) => {
    addRow(
      {
        employe_id: row.employe_id,
        _date: row.date,
        periode_id: row.periodId,
        role_travail_id: row.roleId,
        debugReason: row.debugReason,
        transferredFromPeriodId: row.transferredFromPeriodId,
        transferredFromPeriodName: row.transferredFromPeriodName,
        display_status: row.display_status,
        transfer_type: row.transfer_type,
        source_period: row.source_period,
        target_period: row.target_period,
        source_role: row.source_role,
        target_role: "Controle",
        transferred_from_period: row.transferred_from_period,
        transferred_to_period: row.transferred_to_period,
      },
      row.employeeName
    );
  });

  return rows;
}

function buildDynamicReposRows({ nightRepos, normalRepos }) {
  const rows = [];
  const rowKeys = new Set();

  function addReposRow(row) {
    const rowKey = `${row.employe_id}|${row._date}`;

    if (rowKeys.has(rowKey)) {
      return;
    }

    rowKeys.add(rowKey);
    rows.push(row);
  }

  nightRepos
    .filter((reposRow) => reposRow.insideWeek)
    .forEach((reposRow) => {
      addReposRow({
        employe_id: reposRow.employe_id,
        _date: reposRow.reposDate,
        type: "2j",
      });
    });

  normalRepos
    .filter((reposRow) => !reposRow.excluded)
    .forEach((reposRow) => {
      const type = reposRow.targetReposCount >= 2 ? "2j" : "1j";

      reposRow.reposDates.forEach((date) => {
        addReposRow({
          employe_id: reposRow.employe_id,
          _date: date,
          type,
        });
      });
    });

  return rows;
}

function buildDisplayAssignmentsFromDynamicDayRows(dayShiftAssignments) {
  const displayAssignmentsByEmployeeDate = new Map();

  dayShiftAssignments.rows.forEach((row) => {
    if (!row.display_role) {
      return;
    }

    displayAssignmentsByEmployeeDate.set(
      buildEmployeeDateKey(row.employe_id, row.date),
      row.display_role
    );
  });

  return displayAssignmentsByEmployeeDate;
}

function buildActivePeriodsByGroupIdFromRotation(groupRotation) {
  return groupRotation.assignments.reduce((result, assignment) => {
    result[assignment.groupId] = assignment.periodId;
    return result;
  }, {});
}

function buildDynamicFixedControllersByPeriodId({
  groupRotation,
  periods = [],
  employees,
}) {
  const fixedControllersByPeriodId = {};
  const periodRows =
    periods.length > 0
      ? periods
      : groupRotation.assignments.map((assignment) => ({
          id: assignment.periodId,
          nom: assignment.periodName,
        }));

  periodRows
    .filter((period) => ["MATIN", "SOIR"].includes(normalizeText(period.nom)))
    .forEach((period) => {
      const fixedController = getFixedControlForPeriod(period, employees);

      if (!fixedController) {
        throw new PlanningGenerationError(
          400,
          `No fixed Controle employee found for ${period.nom}.`
        );
      }

      fixedControllersByPeriodId[period.id] = fixedController;
    });

  return fixedControllersByPeriodId;
}

function buildNightAssignments(weekDates, nightCandidates) {
  return new Map(
    weekDates.map((date) => {
      const daysSinceAnchor = getDaysDifference(NIGHT_SHIFT_ANCHOR_DATE, date);
      const blockIndex = Math.floor(
        daysSinceAnchor / NIGHT_SHIFT_BLOCK_LENGTH_DAYS
      );

      return [date, nightCandidates[modulo(blockIndex, nightCandidates.length)]];
    })
  );
}

function getNightBlockIndexForDate(date) {
  const daysSinceAnchor = getDaysDifference(NIGHT_SHIFT_ANCHOR_DATE, date);

  return Math.floor(daysSinceAnchor / NIGHT_SHIFT_BLOCK_LENGTH_DAYS);
}

function getNightBlockInfo(blockIndex, nightCandidates) {
  const employee = nightCandidates[modulo(blockIndex, nightCandidates.length)];

  return {
    blockIndex,
    employeeName: formatEmployeeName(employee),
    employee,
    startDate: addDays(
      NIGHT_SHIFT_ANCHOR_DATE,
      blockIndex * NIGHT_SHIFT_BLOCK_LENGTH_DAYS
    ),
    endDate: addDays(
      NIGHT_SHIFT_ANCHOR_DATE,
      blockIndex * NIGHT_SHIFT_BLOCK_LENGTH_DAYS +
        NIGHT_SHIFT_BLOCK_LENGTH_DAYS -
        1
    ),
  };
}

function buildNightBoundaryRepos(weekDates, nightCandidates, warnings) {
  const weekDateSet = new Set(weekDates);
  const blockIndexes = [
    ...new Set(weekDates.map((date) => getNightBlockIndexForDate(date))),
  ];
  const reposRows = [];
  const reposKeys = new Set();

  for (const blockIndex of blockIndexes) {
    const blockInfo = getNightBlockInfo(blockIndex, nightCandidates);
    const boundaryRepos = [
      {
        date: addDays(blockInfo.startDate, -2),
        type: "before",
      },
      {
        date: addDays(blockInfo.startDate, -1),
        type: "before",
      },
      {
        date: addDays(blockInfo.endDate, 1),
        type: "after",
      },
      {
        date: addDays(blockInfo.endDate, 2),
        type: "after",
      },
    ];

    for (const boundaryReposRow of boundaryRepos) {
      if (!weekDateSet.has(boundaryReposRow.date)) {
        addWarning(
          warnings,
          `Le repos obligatoire ${
            boundaryReposRow.type === "before" ? "avant" : "apr\u00e8s"
          } le service de nuit de ${blockInfo.employeeName} le ${
            boundaryReposRow.date
          } est en dehors de la semaine g\u00e9n\u00e9r\u00e9e.`
        );
        continue;
      }

      const reposKey = `${blockInfo.employee.id}|${boundaryReposRow.date}`;

      if (reposKeys.has(reposKey)) {
        continue;
      }

      reposRows.push({
        employe_id: blockInfo.employee.id,
        _date: boundaryReposRow.date,
        type: "1j",
      });
      reposKeys.add(reposKey);
    }
  }

  return reposRows;
}

function getOfficialWeeklyPattern(startDate) {
  const weekOffset = Math.floor(
    getDaysDifference(OFFICIAL_PATTERN_REFERENCE_DATE, startDate) / 7
  );

  return OFFICIAL_WEEKLY_PATTERNS[
    modulo(weekOffset, OFFICIAL_WEEKLY_PATTERNS.length)
  ];
}

function buildPatternActivePeriodsByGroupId({
  pattern,
  groupA,
  groupB,
  matin,
  soir,
}) {
  const groupByKey = {
    A: groupA,
    B: groupB,
  };
  const periodByShift = {
    Matin: matin,
    Soir: soir,
  };
  const activePeriodsByGroupId = {};

  for (const [shiftName, shiftConfig] of Object.entries(pattern.dayShifts || {})) {
    const group = groupByKey[shiftConfig.groupKey];
    const period = periodByShift[shiftName];

    if (!group || !period) {
      throw new PlanningGenerationError(
        400,
        `Official weekly pattern is missing a valid ${shiftName} mapping.`
      );
    }

    activePeriodsByGroupId[group.id] = period.id;
  }

  return activePeriodsByGroupId;
}

function addRestDateToEmployee(employeeRestDatesById, employeeId, date) {
  if (!employeeRestDatesById.has(employeeId)) {
    employeeRestDatesById.set(employeeId, new Set());
  }

  employeeRestDatesById.get(employeeId).add(date);
}

function buildReposRowsFromEmployeeRestDates(employeeRestDatesById) {
  const reposRows = [];

  for (const [employeeId, dateSet] of employeeRestDatesById.entries()) {
    const sortedDates = [...dateSet].sort();
    let runDates = [];

    function flushRun() {
      if (runDates.length === 0) {
        return;
      }

      const type = runDates.length >= 2 ? "2j" : "1j";
      runDates.forEach((date) => {
        reposRows.push({
          employe_id: employeeId,
          _date: date,
          type,
        });
      });
      runDates = [];
    }

    sortedDates.forEach((date) => {
      const previousDate = runDates[runDates.length - 1];

      if (!previousDate || addDays(previousDate, 1) === date) {
        runDates.push(date);
        return;
      }

      flushRun();
      runDates.push(date);
    });

    flushRun();
  }

  return reposRows;
}

function buildOfficialWeeklyAssignments({
  employees,
  groupA,
  groupB,
  matin,
  soir,
  nuit,
  roleIds,
  weekDates,
  startDate,
}) {
  const pattern = getOfficialWeeklyPattern(startDate);
  const planningRows = [];
  const planningKeys = new Set();
  const assignmentTypesByEmployeeDate = new Map();
  const employeeRestDatesById = new Map();
  const displayAssignmentsByEmployeeDate = new Map();
  const groupByKey = {
    A: groupA,
    B: groupB,
  };

  function resolveEmployee(employeeKey) {
    const employeeAliases = EMPLOYEE_KEY_ALIASES[employeeKey] || [employeeKey];
    const employee =
      employeeAliases
        .map((alias) => findEmployeeByName(employees, alias))
        .find(Boolean) || null;

    if (!employee) {
      throw new PlanningGenerationError(
        400,
        `Official weekly pattern references unknown employee ${employeeKey}.`
      );
    }

    return employee;
  }

  function registerRepos(employee, date) {
    const assignmentKey = buildEmployeeDateKey(employee.id, date);
    const existingType = assignmentTypesByEmployeeDate.get(assignmentKey);

    if (existingType === "planning") {
      throw new PlanningGenerationError(
        400,
        `Official weekly pattern assigns both planning and repos to ${formatEmployeeName(
          employee
        )} on ${date}.`
      );
    }

    assignmentTypesByEmployeeDate.set(assignmentKey, "repos");
    addRestDateToEmployee(employeeRestDatesById, employee.id, date);
  }

  function registerPlanning(employee, date, periodId, roleId, displayLabel) {
    const assignmentKey = buildEmployeeDateKey(employee.id, date);
    const planningKey = `${assignmentKey}|${periodId}`;
    const existingType = assignmentTypesByEmployeeDate.get(assignmentKey);

    if (existingType === "repos") {
      throw new PlanningGenerationError(
        400,
        `Official weekly pattern assigns both repos and planning to ${formatEmployeeName(
          employee
        )} on ${date}.`
      );
    }

    if (planningKeys.has(planningKey)) {
      throw new PlanningGenerationError(
        400,
        `Official weekly pattern duplicates the planning row for ${formatEmployeeName(
          employee
        )} on ${date}.`
      );
    }

    assignmentTypesByEmployeeDate.set(assignmentKey, "planning");
    planningKeys.add(planningKey);
    planningRows.push({
      employe_id: employee.id,
      _date: date,
      periode_id: periodId,
      role_travail_id: roleId,
    });

    if (displayLabel) {
      displayAssignmentsByEmployeeDate.set(assignmentKey, displayLabel);
    }
  }

  function registerAssignmentsForSection({
    sectionEmployees,
    periodId,
    expectedGroupKey = null,
  }) {
    Object.entries(sectionEmployees).forEach(([employeeKey, assignments]) => {
      if (!Array.isArray(assignments) || assignments.length !== weekDates.length) {
        throw new PlanningGenerationError(
          400,
          `Official weekly pattern for ${employeeKey} must contain exactly ${weekDates.length} assignments.`
        );
      }

      const employee = resolveEmployee(employeeKey);

      if (
        expectedGroupKey &&
        !idsMatch(employee.groupe_id, groupByKey[expectedGroupKey]?.id)
      ) {
        throw new PlanningGenerationError(
          400,
          `${formatEmployeeName(employee)} must belong to ${groupByKey[expectedGroupKey]?.nom}.`
        );
      }

      assignments.forEach((rawAssignment, dayIndex) => {
        const assignment = normalizeText(rawAssignment);
        const date = weekDates[dayIndex];

        if (!assignment) {
          return;
        }

        if (assignment === normalizeText(REPOS_ASSIGNMENT)) {
          registerRepos(employee, date);
          return;
        }

        if (assignment === normalizeText(CAISSE_ASSIGNMENT)) {
          registerPlanning(employee, date, periodId, roleIds.guichet, "GUICHET");
          return;
        }

        if (assignment === normalizeText(GUICHET_ASSIGNMENT)) {
          registerPlanning(employee, date, periodId, roleIds.guichet, "GUICHET");
          return;
        }

        if (assignment === normalizeText(CONTROLE_ASSIGNMENT)) {
          registerPlanning(
            employee,
            date,
            periodId,
            roleIds.controle,
            "CONTRÔLE"
          );
          return;
        }

        if (assignment === normalizeText(CAISSE_CONTROLE_ASSIGNMENT)) {
          registerPlanning(
            employee,
            date,
            periodId,
            roleIds.controle,
            "CONTROLE"
          );
          return;
        }

        if (assignment === normalizeText(NIGHT_COMBINED_ASSIGNMENT)) {
          registerPlanning(
            employee,
            date,
            periodId,
            roleIds.guichet,
            "GUICHET"
          );
          return;
        }

        throw new PlanningGenerationError(
          400,
          `Unsupported official weekly assignment '${rawAssignment}' for ${employeeKey} on ${date}.`
        );
      });
    });
  }

  registerAssignmentsForSection({
    sectionEmployees: pattern.dayShifts?.Matin?.employees || {},
    periodId: matin.id,
    expectedGroupKey: pattern.dayShifts?.Matin?.groupKey || null,
  });
  registerAssignmentsForSection({
    sectionEmployees: pattern.dayShifts?.Soir?.employees || {},
    periodId: soir.id,
    expectedGroupKey: pattern.dayShifts?.Soir?.groupKey || null,
  });
  registerAssignmentsForSection({
    sectionEmployees: pattern.nightShift?.employees || {},
    periodId: nuit.id,
  });

  return {
    activePeriodsByGroupId: buildPatternActivePeriodsByGroupId({
      pattern,
      groupA,
      groupB,
      matin,
      soir,
    }),
    planningRows,
    reposRows: buildReposRowsFromEmployeeRestDates(employeeRestDatesById),
    displayAssignmentsByEmployeeDate,
  };
}

function applyDisplayAssignmentsToPlanningRows(
  planningRows,
  displayAssignmentsByEmployeeDate
) {
  return planningRows.map((row) => {
    const displayRole = displayAssignmentsByEmployeeDate.get(
      buildEmployeeDateKey(row.employe_id, row._date || row.date)
    );

    if (!displayRole) {
      return row;
    }

    return {
      ...row,
      display_role: displayRole,
    };
  });
}

function applyTransferMetadataToPlanningRows(planningRows, transferEvents = []) {
  if (!Array.isArray(transferEvents) || transferEvents.length === 0) {
    return planningRows;
  }

  const eventsByTargetRowKey = new Map();

  transferEvents.forEach((event) => {
    const employeeId = event.employeeId || event.employe_id;
    const date = event.date;
    const targetPeriod = event.toPeriodName || event.target_period;

    if (!employeeId || !date || !targetPeriod) {
      return;
    }

    eventsByTargetRowKey.set(
      `${employeeId}|${date}|${normalizeText(targetPeriod)}`,
      event
    );
  });

  return planningRows.map((row) => {
    const rowKey = `${row.employe_id}|${row._date || row.date}|${normalizeText(
      row.periode_travail
    )}`;
    const event = eventsByTargetRowKey.get(rowKey);

    if (!event) {
      return row;
    }

    return {
      ...row,
      display_status: "REPLACEMENT_CONTROL",
      transfer_type: "CROSS_SHIFT_CONTROL",
      source_period: event.fromPeriodName || event.source_period,
      target_period: event.toPeriodName || event.target_period,
      source_role: event.source_role || "Guichet",
      target_role: "Controle",
      transferred_from_period: event.fromPeriodName || event.source_period,
      transferred_to_period: event.toPeriodName || event.target_period,
    };
  });
}

function mergeNightBoundaryRepos({
  nightReposRows,
  generatedReposRows,
  reposByGroupId,
  employeesById,
}) {
  const existingReposKeys = new Set(
    generatedReposRows.map((row) => `${row.employe_id}|${row._date}`)
  );

  for (const nightReposRow of nightReposRows) {
    const reposKey = `${nightReposRow.employe_id}|${nightReposRow._date}`;

    if (existingReposKeys.has(reposKey)) {
      continue;
    }

    const employee = employeesById[nightReposRow.employe_id];

    if (!employee || !reposByGroupId[employee.groupe_id]) {
      continue;
    }

    const groupReposByDate = reposByGroupId[employee.groupe_id];
    const dailyRepos = groupReposByDate.get(nightReposRow._date) || [];

    if (!dailyRepos.includes(employee.id)) {
      dailyRepos.push(employee.id);
      groupReposByDate.set(nightReposRow._date, dailyRepos);
    }

    generatedReposRows.push(nightReposRow);
    existingReposKeys.add(reposKey);
  }
}

function groupReposRowsByGroupId(reposRows, employeesById) {
  return reposRows.reduce((result, reposRow) => {
    const employee = employeesById[reposRow.employe_id];

    if (!employee) {
      return result;
    }

    if (!result[employee.groupe_id]) {
      result[employee.groupe_id] = [];
    }

    result[employee.groupe_id].push(reposRow);

    return result;
  }, {});
}

function buildRestAssignmentsForGroup({
  group,
  groupEmployees,
  weekDates,
  startDate,
  weekNumber,
  nightAssignmentsByDate,
  preassignedReposRows = [],
  globalPreassignedReposRows = [],
  globalPreassignedReposKeys = new Set(),
  existingReposRows = [],
  controlContext = null,
  warnings,
}) {
  const fixedController = null;
  const dailyRestAssignments = new Map(weekDates.map((date) => [date, []]));
  const employeeRestDates = new Map(groupEmployees.map((employee) => [employee.id, []]));
  const reposTypeByEmployeeDate = new Map();
  const restTargets = new Map(
    groupEmployees.map((employee) => [employee.id, getRestDaysTarget(employee, startDate)])
  );

  for (const reposRow of preassignedReposRows) {
    const employee = groupEmployees.find(
      (item) => Number(item.id) === Number(reposRow.employe_id)
    );

    if (!employee || !dailyRestAssignments.has(reposRow._date)) {
      continue;
    }

    const dailyAssignedEmployees = dailyRestAssignments.get(reposRow._date);
    const assignedRestDates = employeeRestDates.get(employee.id);
    const reposKey = `${employee.id}|${reposRow._date}`;
    const reservedControlReplacementIds = getReservedControlReplacementIds(
      controlContext,
      reposRow._date
    );

    if (employeeIdSetHas(reservedControlReplacementIds, employee.id)) {
      throw new PlanningGenerationError(
        400,
        `Required night-boundary repos for ${formatEmployeeName(employee)} on ${reposRow._date} conflicts with a reserved Contrôle replacement.`
      );
    }

    if (!dailyAssignedEmployees.includes(employee.id)) {
      dailyAssignedEmployees.push(employee.id);
    }

    if (!assignedRestDates.includes(reposRow._date)) {
      assignedRestDates.push(reposRow._date);
    }

    reposTypeByEmployeeDate.set(reposKey, reposRow.type || "1j");
  }

  function getNightEmployeeForDate(date) {
    const nightEmployee = nightAssignmentsByDate.get(date);

    if (!nightEmployee || Number(nightEmployee.groupe_id) !== Number(group.id)) {
      return null;
    }

    return nightEmployee;
  }

  function getMaxRestCountForDate(date) {
    const nightEmployee = getNightEmployeeForDate(date);
    const nightCount = nightEmployee ? 1 : 0;

    return Math.max(groupEmployees.length - 3 - nightCount, 0);
  }

  function canAssignRest(employee, date) {
    const assignedRestDates = employeeRestDates.get(employee.id);
    const dailyAssignedEmployees = dailyRestAssignments.get(date);
    const nightEmployee = getNightEmployeeForDate(date);
    const maxRestCount = getMaxRestCountForDate(date);
    const reservedControlReplacementIds = getReservedControlReplacementIds(
      controlContext,
      date
    );

    if (assignedRestDates.length >= restTargets.get(employee.id)) {
      return false;
    }

    if (assignedRestDates.includes(date)) {
      return false;
    }

    if (nightEmployee && Number(nightEmployee.id) === Number(employee.id)) {
      return false;
    }

    if (employeeIdSetHas(reservedControlReplacementIds, employee.id)) {
      return false;
    }

    if (employeeHasReposOnDate(globalPreassignedReposKeys, employee.id, date)) {
      return false;
    }

    if (dailyAssignedEmployees.length >= maxRestCount) {
      return false;
    }

    if (fixedController && Number(employee.id) === Number(fixedController.id)) {
      const replacement = findControlReplacement({
        group,
        groupEmployees,
        fixedController,
        nightEmployee,
        restEmployeeIds: new Set(dailyAssignedEmployees),
      });

      if (!replacement) {
        return false;
      }
    }

    if (
      fixedController &&
      dailyAssignedEmployees.includes(fixedController.id) &&
      employee.sexe === "Homme" &&
      Number(employee.controle_fixe) !== 1
    ) {
      const restEmployeeIds = new Set([...dailyAssignedEmployees, employee.id]);
      const anotherReplacement = groupEmployees.find(
        (candidate) =>
          Number(candidate.id) !== Number(employee.id) &&
          isValidControlReplacement({
            employee: candidate,
            group,
            fixedController,
            nightEmployee,
            restEmployeeIds,
          })
      );

      if (!anotherReplacement) {
        return false;
      }
    }

    return true;
  }

  function assignRest(employee, date, type) {
    dailyRestAssignments.get(date).push(employee.id);
    employeeRestDates.get(employee.id).push(date);
    reposTypeByEmployeeDate.set(`${employee.id}|${date}`, type);

    if (controlContext) {
      const restEmployeeIds = new Set([
        ...globalPreassignedReposRows
          .filter((reposRow) => reposRow._date === date)
          .map((reposRow) => reposRow.employe_id),
        ...existingReposRows
          .filter((reposRow) => reposRow._date === date)
          .map((reposRow) => reposRow.employe_id),
        ...dailyRestAssignments.get(date),
      ]);
      const replacement = findFixedShiftControlReplacementForRest({
        fixedController: employee,
        date,
        restEmployeeIds,
        nightEmployee: nightAssignmentsByDate.get(date),
        controlContext,
      });

      if (replacement) {
        reserveControlReplacementId(controlContext, date, replacement.id);
      }
    }
  }

  function ensureRestOnDate(employee, date, type) {
    if (employeeRestDates.get(employee.id).includes(date)) {
      return true;
    }

    if (!canAssignRest(employee, date)) {
      return false;
    }

    assignRest(employee, date, type);

    return true;
  }

  function snapshotRestState() {
    return {
      dailyRestAssignments: new Map(
        [...dailyRestAssignments.entries()].map(([date, employeeIds]) => [
          date,
          [...employeeIds],
        ])
      ),
      employeeRestDates: new Map(
        [...employeeRestDates.entries()].map(([employeeId, dates]) => [
          employeeId,
          [...dates],
        ])
      ),
      reposTypeByEmployeeDate: new Map(reposTypeByEmployeeDate),
      reservedControlReplacementIdsByDate:
        snapshotReservedControlReplacements(controlContext),
    };
  }

  function restoreRestState(snapshot) {
    dailyRestAssignments.clear();
    snapshot.dailyRestAssignments.forEach((employeeIds, date) => {
      dailyRestAssignments.set(date, employeeIds);
    });

    employeeRestDates.clear();
    snapshot.employeeRestDates.forEach((dates, employeeId) => {
      employeeRestDates.set(employeeId, dates);
    });

    reposTypeByEmployeeDate.clear();
    snapshot.reposTypeByEmployeeDate.forEach((type, key) => {
      reposTypeByEmployeeDate.set(key, type);
    });

    restoreReservedControlReplacements(
      controlContext,
      snapshot.reservedControlReplacementIdsByDate
    );
  }

  function tryAssignConsecutiveRestPair(employee, dates) {
    const snapshot = snapshotRestState();
    const [firstDate, secondDate] = dates;

    if (
      ensureRestOnDate(employee, firstDate, "2j") &&
      ensureRestOnDate(employee, secondDate, "2j")
    ) {
      return true;
    }

    restoreRestState(snapshot);

    return false;
  }

  function getConsecutiveDatePairs() {
    return weekDates.slice(0, -1).map((date, index) => [
      date,
      weekDates[index + 1],
    ]);
  }

  function getAdjacentPairsForDate(date) {
    const index = weekDates.indexOf(date);
    const pairs = [];

    if (index > 0) {
      pairs.push([weekDates[index - 1], date]);
    }

    if (index >= 0 && index < weekDates.length - 1) {
      pairs.push([date, weekDates[index + 1]]);
    }

    return pairs;
  }

  function orderPairsByLoad(pairs, seed) {
    const rotatedPairs = rotateArray(pairs, seed % Math.max(pairs.length, 1));

    return [...rotatedPairs].sort((left, right) => {
      const leftLoad =
        dailyRestAssignments.get(left[0]).length +
        dailyRestAssignments.get(left[1]).length;
      const rightLoad =
        dailyRestAssignments.get(right[0]).length +
        dailyRestAssignments.get(right[1]).length;

      return leftLoad - rightLoad;
    });
  }

  const employeesByPriority = [...groupEmployees].sort((left, right) => {
    const leftIsFixedShiftControl = isShiftFixedControlEmployee(left);
    const rightIsFixedShiftControl = isShiftFixedControlEmployee(right);

    if (leftIsFixedShiftControl !== rightIsFixedShiftControl) {
      return leftIsFixedShiftControl ? -1 : 1;
    }

    const targetDifference = restTargets.get(right.id) - restTargets.get(left.id);

    if (targetDifference !== 0) {
      return targetDifference;
    }

    return left.id - right.id;
  });

  for (const employee of employeesByPriority) {
    const dateSeed = weekNumber + employee.id;
    const rotatedDates = rotateArray(weekDates, dateSeed % weekDates.length);
    const target = restTargets.get(employee.id);

    if (target === 2) {
      const currentRestDates = employeeRestDates.get(employee.id);
      let assignedConsecutivePair = false;

      if (currentRestDates.length >= 2) {
        assignedConsecutivePair = currentRestDates
          .sort()
          .some((date, index, dates) => dates[index + 1] === addDays(date, 1));
      } else if (currentRestDates.length === 1) {
        const adjacentPairs = orderPairsByLoad(
          getAdjacentPairsForDate(currentRestDates[0]),
          dateSeed
        );

        assignedConsecutivePair = adjacentPairs.some((pair) =>
          tryAssignConsecutiveRestPair(employee, pair)
        );
      } else {
        assignedConsecutivePair = orderPairsByLoad(
          getConsecutiveDatePairs(),
          dateSeed
        ).some((pair) => tryAssignConsecutiveRestPair(employee, pair));
      }

      if (!assignedConsecutivePair) {
        addWarning(
          warnings,
          `Impossible d'attribuer 2 jours de repos cons\u00e9cutifs \u00e0 ${employee.prenom} ${employee.nom} dans ${group.nom} en respectant les contraintes.`
        );
      }

      continue;
    }

    const rotatedDateIndex = new Map(
      rotatedDates.map((date, index) => [date, index])
    );
    const orderedCandidateDates = [...rotatedDates].sort((left, right) => {
      const restCountDifference =
        dailyRestAssignments.get(left).length - dailyRestAssignments.get(right).length;

      if (restCountDifference !== 0) {
        return restCountDifference;
      }

      return rotatedDateIndex.get(left) - rotatedDateIndex.get(right);
    });

    for (const date of orderedCandidateDates) {
      if (!canAssignRest(employee, date)) {
        continue;
      }

      assignRest(employee, date, "1j");
      break;
    }

    if (employeeRestDates.get(employee.id).length < target) {
      addWarning(
        warnings,
        `Impossible d'attribuer tous les jours de repos demand\u00e9s \u00e0 ${employee.prenom} ${employee.nom} dans ${group.nom}.`
      );
    }
  }

  const reposRows = [];

  for (const employee of groupEmployees) {
    for (const date of employeeRestDates.get(employee.id)) {
      reposRows.push({
        employe_id: employee.id,
        _date: date,
        type:
          reposTypeByEmployeeDate.get(`${employee.id}|${date}`) ||
          (restTargets.get(employee.id) === 2 ? "2j" : "1j"),
      });
    }
  }

  return {
    fixedController,
    reposRows,
    reposByDate: dailyRestAssignments,
  };
}

function buildPlanningRows({
  groups,
  employeesByGroupId,
  weekDates,
  weekNumber,
  activePeriodsByGroupId,
  roleIds,
  nightAssignmentsByDate,
  reposByGroupId,
  fixedControllersByGroupId,
  warnings,
}) {
  const planningRows = [];

  for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex += 1) {
    const date = weekDates[dayIndex];
    const nightEmployee = nightAssignmentsByDate.get(date);

    planningRows.push({
      employe_id: nightEmployee.id,
      _date: date,
      periode_id: roleIds.nuitPeriodId,
      role_travail_id: roleIds.guichet,
    });

    for (const group of groups) {
      const groupEmployees = employeesByGroupId[group.id] || [];
      const fixedController = fixedControllersByGroupId[group.id] || null;
      const restEmployeeIds = new Set(reposByGroupId[group.id].get(date) || []);
      const shiftEmployees = groupEmployees.filter(
        (employee) =>
          Number(employee.id) !== Number(nightEmployee.id) &&
          !restEmployeeIds.has(employee.id)
      );

      if (shiftEmployees.length < 3) {
        addWarning(
          warnings,
          `Le ${group.nom} a moins de 3 employ\u00e9s disponibles le ${date}.`
        );
      }

      let controlEmployee = null;

      if (
        fixedController &&
        shiftEmployees.some((employee) => Number(employee.id) === Number(fixedController.id))
      ) {
        controlEmployee = shiftEmployees.find(
          (employee) => Number(employee.id) === Number(fixedController.id)
        );
      } else {
        controlEmployee = findControlReplacement({
          activeShiftEmployees: shiftEmployees.filter(
            (employee) => !isShiftFixedControlEmployee(employee)
          ),
          fixedController,
          nightEmployee,
          restEmployeeIds,
        });

        if (!controlEmployee) {
          const fixedControllerName = fixedController
            ? formatEmployeeName(fixedController)
            : "Fixed Contrôle";

          throw new PlanningGenerationError(
            400,
            `Missing Contrôle for ${group.nom} on ${date}. ${fixedControllerName} is unavailable and no valid same-group male replacement exists.`
          );
        }
      }

      planningRows.push({
        employe_id: controlEmployee.id,
        _date: date,
        periode_id: activePeriodsByGroupId[group.id],
        role_travail_id: roleIds.controle,
      });

      const nonControlEmployees = shiftEmployees.filter(
        (employee) => !controlEmployee || Number(employee.id) !== Number(controlEmployee.id)
      );
      const roleSequence = buildAlternatingRoleIds(
        nonControlEmployees.length,
        dayIndex + group.id,
        roleIds
      );

      nonControlEmployees.forEach((employee, index) => {
        planningRows.push({
          employe_id: employee.id,
          _date: date,
          periode_id: activePeriodsByGroupId[group.id],
          role_travail_id: roleSequence[index],
        });
      });
    }
  }

  return planningRows;
}

function buildShiftFixedPlanningRows({
  groups,
  employees,
  employeesByGroupId,
  weekDates,
  activePeriodsByGroupId,
  roleIds,
  nightAssignmentsByDate,
  reposByGroupId,
  fixedControllersByPeriodId,
  warnings,
}) {
  const planningRows = [];
  const shiftPeriodIds = [roleIds.matinPeriodId, roleIds.soirPeriodId];

  for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex += 1) {
    const date = weekDates[dayIndex];
    const nightEmployee = nightAssignmentsByDate.get(date);
    const assignedEmployeeIds = new Set([nightEmployee.id]);
    const restEmployeeIds = new Set(
      Object.values(reposByGroupId).flatMap((reposByDate) =>
        reposByDate.get(date) || []
      )
    );
    const shiftPlans = shiftPeriodIds.map((periodId) => {
      const activeGroup = groups.find(
        (group) => Number(activePeriodsByGroupId[group.id]) === Number(periodId)
      );

      if (!activeGroup) {
        throw new PlanningGenerationError(
          400,
          `Missing active group for period ${periodId} on ${date}.`
        );
      }

      const activeShiftEmployees = buildActiveShiftNormalEmployees({
        activeGroup,
        employees: employeesByGroupId[activeGroup.id] || [],
        nightEmployee,
        restEmployeeIds,
      });

      return {
        periodId,
        activeGroup,
        activeShiftEmployees,
        controlEmployee: null,
      };
    });

    planningRows.push({
      employe_id: nightEmployee.id,
      _date: date,
      periode_id: roleIds.nuitPeriodId,
      role_travail_id: roleIds.guichet,
    });

    for (const shiftPlan of shiftPlans) {
      const fixedController = fixedControllersByPeriodId[shiftPlan.periodId] || null;

      if (!fixedController) {
        throw new PlanningGenerationError(
          400,
          `Missing fixed Contrôle configuration for period ${shiftPlan.periodId} on ${date}.`
        );
      }

      if (
        !employeeIdSetHas(restEmployeeIds, fixedController.id) &&
        !idsMatch(fixedController.id, nightEmployee.id) &&
        !employeeIdSetHas(assignedEmployeeIds, fixedController.id)
      ) {
        shiftPlan.controlEmployee = fixedController;
      } else {
        shiftPlan.controlEmployee = findControlReplacement({
          activeShiftEmployees: shiftPlan.activeShiftEmployees.filter(
            (employee) => !employeeIdSetHas(assignedEmployeeIds, employee.id)
          ),
          fixedController,
          nightEmployee,
          restEmployeeIds,
          assignedEmployeeIds,
        });

        if (!shiftPlan.controlEmployee) {
          addWarning(
            warnings,
            buildMissingControlReplacementWarning(fixedController, date)
          );
          continue;
        }
      }

      planningRows.push({
        employe_id: shiftPlan.controlEmployee.id,
        _date: date,
        periode_id: shiftPlan.periodId,
        role_travail_id: roleIds.controle,
      });
      assignedEmployeeIds.add(shiftPlan.controlEmployee.id);
    }

    for (const shiftPlan of shiftPlans) {
      const availableNormalEmployees = shiftPlan.activeShiftEmployees.filter(
        (employee) => !employeeIdSetHas(assignedEmployeeIds, employee.id)
      );

      if (availableNormalEmployees.length < 2) {
        addWarning(
          warnings,
          `Le ${shiftPlan.activeGroup.nom} a moins de 2 employ\u00e9s normaux disponibles pour la p\u00e9riode ${shiftPlan.periodId} le ${date}.`
        );
      }

      const roleSequence = buildAlternatingRoleIds(
        availableNormalEmployees.length,
        dayIndex + shiftPlan.activeGroup.id,
        roleIds
      );

      availableNormalEmployees.forEach((employee, index) => {
        planningRows.push({
          employe_id: employee.id,
          _date: date,
          periode_id: shiftPlan.periodId,
          role_travail_id: roleSequence[index],
        });
        assignedEmployeeIds.add(employee.id);
      });
    }
  }

  return planningRows;
}

function addValidationError(errors, message) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function isAllowedDisplayRole(value) {
  if (!value) {
    return true;
  }

  const normalizedValue = normalizeText(value).replace(/\s+/g, "");

  return ["CONTRÔLE", "CONTROLE", "GUICHET"].includes(normalizedValue);
}

function isUglyConcatenatedDisplayRole(value) {
  const normalizedValue = normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/Ô/g, "O");

  return normalizedValue === "CAISSECONTROLE";
}

function isForbiddenCombinedOrCaisseRole(value) {
  const normalizedValue = normalizeText(value)
    .replace(/\+/g, "/")
    .replace(/\s+/g, "")
    .replace(/Ô/g, "O");

  return (
    normalizedValue.includes("CAISSE") ||
    normalizedValue.includes("/") ||
    normalizedValue.includes("+") ||
    normalizedValue === "GUICHETCONTROLE" ||
    normalizedValue === "CAISSECONTROLE" ||
    normalizedValue === "GUICHETCAISSE" ||
    normalizedValue === "CAISSEGUICHET"
  );
}

function isAllowedGeneratedRole(value) {
  const normalizedValue = normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/Ã”/g, "O");

  return ["GUICHET", "CONTROLE"].includes(normalizedValue);
}

function buildLookupById(rows) {
  return rows.reduce((result, row) => {
    result[row.id] = row;

    return result;
  }, {});
}

function getPlanningEmployeeGroup(row, employeesById) {
  const employee = employeesById[row.employe_id];

  return employee ? employee.groupe_id : null;
}

function validateGeneratedPlanningBeforeCommit({
  planningRows,
  reposRows,
  warnings,
  displayAssignmentsByEmployeeDate = new Map(),
  employees,
  groups,
  periods,
  roles,
  weekDates,
  activePeriodsByGroupId,
  roleIds,
  hasNightAuthorization,
  nightCandidates,
  fixedControllersByPeriodId,
}) {
  const errors = [];
  const employeesById = buildLookupById(employees);
  const groupsById = buildLookupById(groups);
  const periodsById = buildLookupById(periods);
  const rolesById = buildLookupById(roles);
  const nightCandidateIds = new Set((nightCandidates || []).map((employee) => employee.id));
  const reposByEmployeeDate = new Set(
    reposRows.map((row) => `${row.employe_id}|${row._date}`)
  );
  const planningByEmployeeDate = planningRows.reduce((result, row) => {
    const key = `${row.employe_id}|${row._date}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(row);

    return result;
  }, {});
  const planningByEmployeeDatePeriod = planningRows.reduce((result, row) => {
    const key = `${row.employe_id}|${row._date}|${row.periode_id}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(row);

    return result;
  }, {});
  const nightRowsByDate = {};

  displayAssignmentsByEmployeeDate.forEach((displayRole, key) => {
    if (
      isUglyConcatenatedDisplayRole(displayRole) ||
      !isAllowedDisplayRole(displayRole)
    ) {
      addValidationError(
        errors,
        `${key}: invalid display role '${displayRole}'. Combined roles and Caisse labels are not allowed.`
      );
    }
  });

  for (const row of planningRows) {
    const employee = employeesById[row.employe_id];
    const period = periodsById[row.periode_id];
    const role = rolesById[row.role_travail_id];
    const employeeName = employee ? formatEmployeeName(employee) : row.employe_id;

    if (!employee) {
      addValidationError(
        errors,
        `${row._date}: planning references unknown employee ${row.employe_id}.`
      );
      continue;
    }

    if (Number(employee.actif) !== 1) {
      addValidationError(
        errors,
        `${row._date}: inactive employee ${employeeName} cannot be assigned.`
      );
    }

    if (!role) {
      addValidationError(
        errors,
        `${row._date} ${period?.nom || row.periode_id}: unknown role ${row.role_travail_id} for ${employeeName}.`
      );
    } else if (
      isForbiddenCombinedOrCaisseRole(role.nom) ||
      !isAllowedGeneratedRole(role.nom)
    ) {
      addValidationError(
        errors,
        `${row._date} ${period?.nom || row.periode_id}: role ${role.nom} is not allowed for ${employeeName}.`
      );
    }

    if (reposByEmployeeDate.has(`${row.employe_id}|${row._date}`)) {
      addValidationError(
        errors,
        `${row._date}: ${employeeName} has repos and planning on the same date.`
      );
    }

    if (Number(row.periode_id) === Number(roleIds.nuitPeriodId)) {
      if (!nightRowsByDate[row._date]) {
        nightRowsByDate[row._date] = [];
      }

      nightRowsByDate[row._date].push(row);

      if (!employeeIdSetHas(nightCandidateIds, employee.id)) {
        addValidationError(
          errors,
          `${row._date} Nuit: ${employeeName} is not configured as an active night-capable employee.`
        );
      }

      if (employee.sexe !== "Homme") {
        addValidationError(
          errors,
          `${row._date} Nuit: ${employeeName} is not Homme.`
        );
      }

      if (
        hasNightAuthorization &&
        Number(employee.travail_nuit_autorise) !== 1
      ) {
        addValidationError(
          errors,
          `${row._date} Nuit: ${employeeName} does not have travail_nuit_autorise = 1.`
        );
      }

      if (Number(employee.controle_fixe) === 1) {
        addValidationError(
          errors,
          `${row._date} Nuit: fixed Contrôle employee ${employeeName} cannot be assigned to Nuit.`
        );
      }

      if (Number(row.role_travail_id) !== Number(roleIds.guichet)) {
        addValidationError(
          errors,
          `${row._date} Nuit: role must be Guichet, found ${role?.nom || row.role_travail_id}.`
        );
      }
    }
  }

  Object.entries(planningByEmployeeDate).forEach(([key, rows]) => {
    if (rows.length <= 1) {
      return;
    }

    const [employeId, date] = key.split("|");
    const employee = employeesById[employeId];

    addValidationError(
      errors,
      `${date}: ${employee ? formatEmployeeName(employee) : employeId} has more than one planning row.`
    );
  });

  Object.entries(planningByEmployeeDatePeriod).forEach(([key, rows]) => {
    if (rows.length <= 1) {
      return;
    }

    const [employeId, date, periodId] = key.split("|");
    const employee = employeesById[employeId];
    const period = periodsById[periodId];

    addValidationError(
      errors,
      `${date}: ${employee ? formatEmployeeName(employee) : employeId} has duplicate planning rows for ${period?.nom || periodId}.`
    );
  });

  Object.entries(planningByEmployeeDate).forEach(([key, rows]) => {
    const [employeId, date] = key.split("|");
    const hasMatin = rows.some((row) =>
      idsMatch(row.periode_id, roleIds.matinPeriodId)
    );
    const hasSoir = rows.some((row) =>
      idsMatch(row.periode_id, roleIds.soirPeriodId)
    );

    if (!hasMatin || !hasSoir) {
      return;
    }

    const employee = employeesById[employeId];

    addValidationError(
      errors,
      `${date}: ${employee ? formatEmployeeName(employee) : employeId} is assigned to both Matin and Soir.`
    );
  });

  for (const date of weekDates) {
    const nightRows = nightRowsByDate[date] || [];

    if (nightRows.length !== 1) {
      addValidationError(
        errors,
        `${date} Nuit: expected exactly one night employee, found ${nightRows.length}.`
      );
    }
  }

  for (const periodId of [roleIds.matinPeriodId, roleIds.soirPeriodId]) {
    const period = periodsById[periodId];
    const shiftName = period?.nom || periodId;
    const fixedController = fixedControllersByPeriodId[periodId];
    const expectedFixedControlPeriod = getExpectedFixedControlPeriod(shiftName);
    const oppositePeriodId =
      idsMatch(periodId, roleIds.matinPeriodId)
        ? roleIds.soirPeriodId
        : roleIds.matinPeriodId;
    const oppositeFixedController = fixedControllersByPeriodId[oppositePeriodId];
    const activeGroup = groups.find((group) =>
      idsMatch(activePeriodsByGroupId[group.id], periodId)
    );
    if (!activeGroup) {
      addValidationError(
        errors,
        `${shiftName}: missing active normal group for period ${periodId}.`
      );
      continue;
    }

    for (const date of weekDates) {
      const shiftRows = planningRows.filter(
        (row) =>
          row._date === date &&
          Number(row.periode_id) === Number(periodId)
      );
      const controlRows = shiftRows.filter(
        (row) => Number(row.role_travail_id) === Number(roleIds.controle)
      );

      if (shiftRows.length < 3) {
        if (shiftRows.length > 0) {
          addWarning(
            warnings,
            `Le service ${shiftName} du ${date} contient seulement ${shiftRows.length} employ\u00e9${shiftRows.length > 1 ? "s" : ""} car la priorit\u00e9 a \u00e9t\u00e9 donn\u00e9e aux repos/Nuit.`
          );
        } else {
          addValidationError(
            errors,
            `${date} ${shiftName}: expected at least 3 employees, found ${shiftRows.length}.`
          );
        }
      }

      const restEmployeeIds = new Set(
        reposRows
          .filter((row) => row._date === date)
          .map((row) => row.employe_id)
      );
      const nightEmployee = (nightRowsByDate[date] || [])
        .map((row) => employeesById[row.employe_id])
        .find(Boolean);
      const fixedControllerUnavailable =
        employeeIdSetHas(restEmployeeIds, fixedController.id) ||
        (nightEmployee && idsMatch(nightEmployee.id, fixedController.id));
      const assignedElsewhereIds = new Set(
        planningRows
          .filter(
            (row) =>
              row._date === date &&
              !idsMatch(row.periode_id, periodId)
          )
          .map((row) => row.employe_id)
      );
      const activeShiftEmployees = buildActiveShiftNormalEmployees({
        activeGroup,
        employees,
        nightEmployee,
        restEmployeeIds,
        assignedEmployeeIds: assignedElsewhereIds,
      });

      if (controlRows.length === 0) {
        if (!fixedControllerUnavailable) {
          addValidationError(
            errors,
            `${date} ${shiftName}: expected exactly one Contrôle, found 0.`
          );
          continue;
        }

        const replacement = findControlReplacement({
          activeShiftEmployees,
          fixedController,
          nightEmployee,
          restEmployeeIds,
          assignedEmployeeIds: assignedElsewhereIds,
        });

        if (replacement) {
          addValidationError(
            errors,
            `${date} ${shiftName}: expected exactly one Contrôle, found 0.`
          );
        }

        continue;
      }

      if (controlRows.length !== 1) {
        addValidationError(
          errors,
          `${date} ${shiftName}: expected exactly one Contrôle, found ${controlRows.length}.`
        );
        continue;
      }

      const controlRow = controlRows[0];
      const controlEmployee = employeesById[controlRow.employe_id];

      if (!controlEmployee || !fixedController) {
        continue;
      }

      if (
        oppositeFixedController &&
        idsMatch(controlEmployee.id, oppositeFixedController.id)
      ) {
        addValidationError(
          errors,
          `${date} ${shiftName}: ${formatEmployeeName(oppositeFixedController)} cannot be ${expectedFixedControlPeriod} Controle.`
        );
      }

      if (!fixedControllerUnavailable) {
        if (!idsMatch(controlEmployee.id, fixedController.id)) {
          addValidationError(
            errors,
            `${date} ${shiftName}: expected ${formatEmployeeName(fixedController)} as Controle, found ${formatEmployeeName(controlEmployee)}.`
          );
        }

        continue;
      }

      const isActiveShiftEmployee = activeShiftEmployees.some((employee) =>
        idsMatch(employee.id, controlEmployee.id)
      );
      const isCrossShiftTransfer =
        controlRow.debugReason === "control_cross_shift_transfer" &&
        controlRow.transferredFromPeriodId &&
        !employeeIdSetHas(assignedElsewhereIds, controlEmployee.id);

      if (!isActiveShiftEmployee && !isCrossShiftTransfer) {
        addValidationError(
          errors,
          `${date} ${shiftName}: Contrôle replacement ${formatEmployeeName(controlEmployee)} is not assigned in the same shift.`
        );
      }

      if (
        !isValidControlReplacement({
          employee: controlEmployee,
          fixedController,
          nightEmployee,
          restEmployeeIds,
          assignedEmployeeIds: assignedElsewhereIds,
        })
      ) {
        addValidationError(
          errors,
          `${date} ${shiftName}: invalid Contrôle replacement ${formatEmployeeName(controlEmployee)}.`
        );
      }
    }
  }

  for (const group of []) {
    const activePeriodId = activePeriodsByGroupId[group.id];

    if (!activePeriodId) {
      continue;
    }

    const fixedController = fixedControllersByGroupId[group.id];

    for (const date of weekDates) {
      const shiftRows = planningRows.filter(
        (row) =>
          row._date === date &&
          Number(row.periode_id) === Number(activePeriodId) &&
          Number(getPlanningEmployeeGroup(row, employeesById)) === Number(group.id)
      );
      const period = periodsById[activePeriodId];
      const shiftName = period?.nom || activePeriodId;
      const controlRows = shiftRows.filter(
        (row) => Number(row.role_travail_id) === Number(roleIds.controle)
      );

      if (shiftRows.length < 3) {
        if (shiftRows.length === 2) {
          addWarning(
            warnings,
            `Le service ${shiftName} du ${date} contient seulement 2 employ\u00e9s car la priorit\u00e9 a \u00e9t\u00e9 donn\u00e9e aux repos.`
          );
        } else {
          addValidationError(
            errors,
            `${date} ${shiftName} ${group.nom}: expected at least 3 employees, found ${shiftRows.length}.`
          );
        }
      }

      if (controlRows.length !== 1) {
        addValidationError(
          errors,
          `${date} ${shiftName} ${group.nom}: expected exactly one Contrôle, found ${controlRows.length}.`
        );
        continue;
      }

      const controlRow = controlRows[0];
      const controlEmployee = employeesById[controlRow.employe_id];

      if (!controlEmployee) {
        continue;
      }

      if (Number(controlEmployee.groupe_id) !== Number(group.id)) {
        addValidationError(
          errors,
          `${date} ${shiftName} ${group.nom}: Contrôle employee ${formatEmployeeName(controlEmployee)} belongs to another group.`
        );
      }

      if (
        fixedController &&
        Number(controlEmployee.id) !== Number(fixedController.id)
      ) {
        const restEmployeeIds = new Set(
          reposRows
            .filter((row) => row._date === date)
            .map((row) => row.employe_id)
        );
        const nightEmployee = (nightRowsByDate[date] || [])
          .map((row) => employeesById[row.employe_id])
          .find(Boolean);

        if (
          !isValidControlReplacement({
            employee: controlEmployee,
            group,
            fixedController,
            nightEmployee,
            restEmployeeIds,
          })
        ) {
          addValidationError(
            errors,
            `${date} ${shiftName} ${group.nom}: invalid Contrôle replacement ${formatEmployeeName(controlEmployee)}.`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new PlanningGenerationError(
      422,
      `Generated planning violates business rules: ${errors.join(" | ")}`
    );
  }
}

async function fetchGeneratedPlanning(connection, startDate, endDate) {
  const [rows] = await connection.query(
    `
      ${PLANNING_SELECT_QUERY}
      WHERE p._date BETWEEN ? AND ?
      ORDER BY p._date ASC, p.periode_id ASC, p.employe_id ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

async function fetchGeneratedRepos(connection, startDate, endDate) {
  const [rows] = await connection.query(
    `
      ${REPOS_SELECT_QUERY}
      WHERE r._date BETWEEN ? AND ?
      ORDER BY r._date ASC, r.employe_id ASC
    `,
    [startDate, endDate]
  );

  return rows;
}

async function generateWeeklyPlanning({ startDate, weekNumber, overwrite = false }) {
  const normalizedStartDate = String(startDate || "").trim();

  if (!normalizedStartDate) {
    throw new PlanningGenerationError(400, "startDate is required");
  }

  if (!isValidDateString(normalizedStartDate)) {
    throw new PlanningGenerationError(
      400,
      "startDate must be a valid date in YYYY-MM-DD format"
    );
  }

  if (!isMonday(normalizedStartDate)) {
    throw new PlanningGenerationError(400, "startDate must be a Monday");
  }

  getRestPatternWeekOffset(normalizedStartDate);

  const derivedWeekNumber = getPlanningWeekNumber(normalizedStartDate);

  if (weekNumber !== undefined) {
    const parsedWeekNumber = parsePositiveInt(weekNumber);

    if (!parsedWeekNumber) {
      throw new PlanningGenerationError(
        400,
        "weekNumber must be a valid positive integer"
      );
    }

    if (parsedWeekNumber !== derivedWeekNumber) {
      throw new PlanningGenerationError(
        400,
        `Invalid weekNumber. For startDate ${normalizedStartDate}, expected weekNumber is ${derivedWeekNumber}.`
      );
    }
  }

  if (overwrite !== undefined && typeof overwrite !== "boolean") {
    throw new PlanningGenerationError(
      400,
      "overwrite must be a boolean value"
    );
  }

  const endDate = addDays(normalizedStartDate, 6);
  const weekDates = getWeekDates(normalizedStartDate);
  const warnings = [];
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const hasNightAuthorization = await hasNightAuthorizationColumn(connection);
    const [groupRows, periodRows, roleRows, employeeRows] = await Promise.all([
      connection.query("SELECT id, nom FROM groupes ORDER BY id ASC"),
      connection.query("SELECT id, nom FROM periodes_travail ORDER BY id ASC"),
      connection.query("SELECT id, nom FROM roles_travail ORDER BY id ASC"),
      fetchEmployees(connection, hasNightAuthorization),
    ]);
    const groups = groupRows[0];
    const periods = periodRows[0];
    const roles = roleRows[0];
    const employees = employeeRows;

    validateEmployeePlanningConfig(employees, hasNightAuthorization);

    const [existingPlanningRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM planning WHERE _date BETWEEN ? AND ?",
      [normalizedStartDate, endDate]
    );
    const [existingReposRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM repos WHERE _date BETWEEN ? AND ?",
      [normalizedStartDate, endDate]
    );

    if (
      (existingPlanningRows[0].total > 0 || existingReposRows[0].total > 0) &&
      !overwrite
    ) {
      throw new PlanningGenerationError(
        409,
        "Planning or repos already exist for the requested week. Use overwrite=true to regenerate it."
      );
    }

    if (overwrite) {
      await connection.query(
        "DELETE FROM planning WHERE _date BETWEEN ? AND ?",
        [normalizedStartDate, endDate]
      );
      await connection.query(
        "DELETE FROM repos WHERE _date BETWEEN ? AND ?",
        [normalizedStartDate, endDate]
      );
    }

    const groupA = findByNormalizedNames(groups, ["Groupe A", "Groupe 1"]);
    const groupB = findByNormalizedNames(groups, ["Groupe B", "Groupe 2"]);
    const matin = findByNormalizedName(periods, "Matin");
    const soir = findByNormalizedName(periods, "Soir");
    const nuit = findByNormalizedName(periods, "Nuit");
    const guichet = findByNormalizedName(roles, "Guichet");
    const controle =
      findByNormalizedNames(roles, ["Contrôle", "Controle"]) ||
      roles.find((role) => normalizeText(role.nom).startsWith("CONTROLE"));

    if (!groupA || !groupB) {
      throw new PlanningGenerationError(
        400,
        "Required groups Groupe A and Groupe B were not found. Fallback names Groupe 1 and Groupe 2 are also supported."
      );
    }

    if (!matin || !soir || !nuit) {
      throw new PlanningGenerationError(
        400,
        "Required work periods Matin, Soir and Nuit were not found"
      );
    }

    const groupShiftRotation = getGroupShiftRotation(
      normalizedStartDate,
      groups,
      periods
    );

    if (!guichet || !controle) {
      throw new PlanningGenerationError(
        400,
        "Required work roles Guichet and Contrôle were not found. Controle without accent is also supported."
      );
    }

    const nightCandidates = buildNightCandidates(
      employees,
      hasNightAuthorization,
      warnings
    );

    if (nightCandidates.length === 0) {
      throw new PlanningGenerationError(
        400,
        "No eligible employees were found for night shift generation"
      );
    }

    const dynamicNightAssignments = getNightAssignmentsForWeek(
      weekDates,
      nightCandidates
    );
    const dynamicNightRepos = getNightReposForWeek(weekDates, nightCandidates);
    dynamicNightRepos
      .filter((reposRow) => !reposRow.insideWeek)
      .forEach((reposRow) => {
        addWarning(
          warnings,
          `Repos Nuit obligatoire hors semaine: ${reposRow.employeeName} ${reposRow.reason} le ${reposRow.reposDate}.`
        );
      });
    const dynamicNormalRepos = getNormalReposForWeek(
      weekDates,
      employees,
      nightCandidates,
      dynamicNightRepos
    );
    const dynamicDayShiftAssignments = buildDynamicDayShiftAssignments({
      weekDates,
      employees,
      groupRotation: groupShiftRotation,
      roles,
      nightAssignments: dynamicNightAssignments,
      nightRepos: dynamicNightRepos,
      normalRepos: dynamicNormalRepos,
    });

    dynamicDayShiftAssignments.warnings.forEach((warning) => {
      addWarning(warnings, warning);
    });

    const generatedPlanningRows = buildDynamicPlanningRows({
      nightAssignments: dynamicNightAssignments,
      dayShiftAssignments: dynamicDayShiftAssignments,
      nuit,
      guichet,
    });
    const generatedReposRows = buildDynamicReposRows({
      nightRepos: dynamicNightRepos,
      normalRepos: dynamicNormalRepos,
    });
    const displayAssignmentsByEmployeeDate =
      buildDisplayAssignmentsFromDynamicDayRows(dynamicDayShiftAssignments);
    const transferEvents = dynamicDayShiftAssignments.transferEvents || [];
    const activePeriodsByGroupId =
      buildActivePeriodsByGroupIdFromRotation(groupShiftRotation);
    const fixedControllersByPeriodId = buildDynamicFixedControllersByPeriodId({
      groupRotation: groupShiftRotation,
      periods,
      employees,
    });


    validateGeneratedPlanningBeforeCommit({
      planningRows: generatedPlanningRows,
      reposRows: generatedReposRows,
      warnings,
      displayAssignmentsByEmployeeDate,
      employees,
      groups: [groupA, groupB],
      periods,
      roles,
      weekDates,
      activePeriodsByGroupId,
      roleIds: {
        controle: controle.id,
        guichet: guichet.id,
        matinPeriodId: matin.id,
        soirPeriodId: soir.id,
        nuitPeriodId: nuit.id,
      },
      hasNightAuthorization,
      nightCandidates,
      fixedControllersByPeriodId,
    });

    if (generatedReposRows.length > 0) {
      const reposValuesClause = generatedReposRows
        .map(() => "(?, ?, ?)")
        .join(", ");
      const reposParams = generatedReposRows.flatMap((row) => [
        row.employe_id,
        row._date,
        row.type,
      ]);

      await connection.query(
        `
          INSERT INTO repos (
            employe_id,
            _date,
            type
          )
          VALUES ${reposValuesClause}
        `,
        reposParams
      );
    }

    if (generatedPlanningRows.length > 0) {
      const planningValuesClause = generatedPlanningRows
        .map(() => "(?, ?, ?, ?)")
        .join(", ");
      const planningParams = generatedPlanningRows.flatMap((row) => [
        row.employe_id,
        row._date,
        row.periode_id,
        row.role_travail_id,
      ]);

      await connection.query(
        `
          INSERT INTO planning (
            employe_id,
            _date,
            periode_id,
            role_travail_id
          )
          VALUES ${planningValuesClause}
        `,
        planningParams
      );
    }

    const [planning, repos] = await Promise.all([
      fetchGeneratedPlanning(connection, normalizedStartDate, endDate),
      fetchGeneratedRepos(connection, normalizedStartDate, endDate),
    ]);

    await connection.commit();

    return {
      message: "Weekly planning generated successfully",
      week: {
        startDate: normalizedStartDate,
        endDate,
        weekNumber: derivedWeekNumber,
      },
      planning: applyTransferMetadataToPlanningRows(
        applyDisplayAssignmentsToPlanningRows(
          planning,
          displayAssignmentsByEmployeeDate
        ),
        transferEvents
      ),
      repos,
      transferEvents,
      transferMarkers: transferEvents,
      warnings,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  PlanningGenerationError,
  buildDynamicDayShiftAssignments,
  buildUnavailableEmployeeDateSet,
  findSameGroupMaleControlReplacement,
  generateWeeklyPlanning,
  getFixedControlForGroup,
  getGroupShiftRotation,
  getNightAssignmentsForWeek,
  getNightBoundaryReposForBlock,
  getNightBlockForDate,
  getNightReposForWeek,
  getNormalReposForWeek,
  getNormalReposTargetForWeek,
  isEmployeeUnavailableForDayShift,
  getWeekOffsetFromAnchor,
  validateEmployeePlanningConfig,
  getEmployeePlanningConfigErrors,
};
