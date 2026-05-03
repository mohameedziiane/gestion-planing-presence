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
const NIGHT_SHIFT_ORDER = ["SABER", "AYOUB", "YOUNESS"];
const PLANNING_WEEK_ANCHOR_DATE = "2026-05-04";
const MILLISECONDS_PER_DAY = 86400000;
const GROUP_A_FIXED_CONTROL_NAME = "MONCEF";
const GROUP_B_FIXED_CONTROL_NAME = "SAID";

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

function getExpectedFixedControlNameForGroup(group) {
  const normalizedGroupName = normalizeText(group.nom);

  if (normalizedGroupName === normalizeText("Groupe A") ||
      normalizedGroupName === normalizeText("Groupe 1")) {
    return GROUP_A_FIXED_CONTROL_NAME;
  }

  if (normalizedGroupName === normalizeText("Groupe B") ||
      normalizedGroupName === normalizeText("Groupe 2")) {
    return GROUP_B_FIXED_CONTROL_NAME;
  }

  return null;
}

function formatEmployeeName(employee) {
  return `${employee.prenom} ${employee.nom}`.trim();
}

function findFixedControllerForGroup(group, groupEmployees) {
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
}

function isValidControlReplacement({
  employee,
  group,
  fixedController,
  nightEmployee,
  restEmployeeIds,
}) {
  if (Number(employee.id) === Number(fixedController.id)) {
    return false;
  }

  if (employee.sexe !== "Homme") {
    return false;
  }

  if (Number(employee.groupe_id) !== Number(group.id)) {
    return false;
  }

  if (restEmployeeIds.has(employee.id)) {
    return false;
  }

  if (nightEmployee && Number(employee.id) === Number(nightEmployee.id)) {
    return false;
  }

  return true;
}

function findControlReplacement({
  group,
  groupEmployees,
  fixedController,
  nightEmployee,
  restEmployeeIds,
}) {
  return (
    groupEmployees.find((employee) =>
      isValidControlReplacement({
        employee,
        group,
        fixedController,
        nightEmployee,
        restEmployeeIds,
      })
    ) || null
  );
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

function getRestDaysTarget(employee, weekNumber) {
  return (employee.id + weekNumber) % 2 === 0 ? 2 : 1;
}

function buildAlternatingRoleIds(count, seed, roleIds) {
  const orderedRoleIds =
    seed % 2 === 0
      ? [roleIds.guichet, roleIds.caisse]
      : [roleIds.caisse, roleIds.guichet];

  return Array.from({ length: count }, (_, index) => orderedRoleIds[index % 2]);
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
        e.controle_fixe,
        g.nom AS groupe
        ${nightColumnSelect}
      FROM employes e
      JOIN groupes g ON g.id = e.groupe_id
      ORDER BY e.groupe_id ASC, e.id ASC
    `
  );

  return rows;
}

function getNightCycleName(employee) {
  const prenom = normalizeText(employee.prenom);
  const nom = normalizeText(employee.nom);

  return NIGHT_SHIFT_ORDER.find(
    (expectedName) =>
      normalizeText(expectedName) === prenom ||
      normalizeText(expectedName) === nom
  );
}

function isEligibleNightEmployee(employee, hasNightAuthorization) {
  if (!getNightCycleName(employee)) {
    return false;
  }

  if (employee.sexe !== "Homme") {
    return false;
  }

  if (Number(employee.controle_fixe) === 1) {
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
      "Column employes.travail_nuit_autorise is missing. Night authorization was not checked for night shift candidates."
    );
  }

  const nightCandidatesByName = new Map();

  for (const employee of employees) {
    const nightCycleName = getNightCycleName(employee);

    if (!nightCycleName) {
      continue;
    }

    if (isEligibleNightEmployee(employee, hasNightAuthorization)) {
      nightCandidatesByName.set(nightCycleName, employee);
    }
  }

  const missingNames = NIGHT_SHIFT_ORDER.filter(
    (employeeName) => !nightCandidatesByName.has(employeeName)
  );

  if (missingNames.length > 0) {
    throw new PlanningGenerationError(
      400,
      `Required night employee(s) missing or not eligible: ${missingNames.join(
        ", "
      )}. Night employees must be SABER, AYOUB and YOUNESS, male, non-fixed control employees${
        hasNightAuthorization ? " with travail_nuit_autorise = 1" : ""
      }.`
    );
  }

  return NIGHT_SHIFT_ORDER.map((employeeName) =>
    nightCandidatesByName.get(employeeName)
  );
}

function buildNightAssignments(weekDates, nightCandidates) {
  const nightCandidatesByName = new Map(
    nightCandidates.map((employee) => [getNightCycleName(employee), employee])
  );

  return new Map(
    weekDates.map((date) => {
      const daysSinceAnchor = getDaysDifference(NIGHT_SHIFT_ANCHOR_DATE, date);
      const blockIndex = Math.floor(
        daysSinceAnchor / NIGHT_SHIFT_BLOCK_LENGTH_DAYS
      );
      const employeeName =
        NIGHT_SHIFT_ORDER[modulo(blockIndex, NIGHT_SHIFT_ORDER.length)];

      return [date, nightCandidatesByName.get(employeeName)];
    })
  );
}

function getNightBlockIndexForDate(date) {
  const daysSinceAnchor = getDaysDifference(NIGHT_SHIFT_ANCHOR_DATE, date);

  return Math.floor(daysSinceAnchor / NIGHT_SHIFT_BLOCK_LENGTH_DAYS);
}

function getNightBlockInfo(blockIndex, nightCandidatesByName) {
  const employeeName =
    NIGHT_SHIFT_ORDER[modulo(blockIndex, NIGHT_SHIFT_ORDER.length)];

  return {
    blockIndex,
    employeeName,
    employee: nightCandidatesByName.get(employeeName),
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
  const nightCandidatesByName = new Map(
    nightCandidates.map((employee) => [getNightCycleName(employee), employee])
  );
  const reposRows = [];

  for (const blockIndex of blockIndexes) {
    const blockInfo = getNightBlockInfo(blockIndex, nightCandidatesByName);
    const boundaryRepos = [
      {
        date: addDays(blockInfo.startDate, -1),
        type: "before",
      },
      {
        date: addDays(blockInfo.endDate, 1),
        type: "after",
      },
    ];

    for (const boundaryReposRow of boundaryRepos) {
      if (!weekDateSet.has(boundaryReposRow.date)) {
        addWarning(
          warnings,
          `Required ${boundaryReposRow.type} night repos for ${blockInfo.employeeName} on ${boundaryReposRow.date} is outside the generated week ${weekDates[0]} to ${weekDates[weekDates.length - 1]}.`
        );
        continue;
      }

      reposRows.push({
        employe_id: blockInfo.employee.id,
        _date: boundaryReposRow.date,
        type: "1j",
      });
    }
  }

  return reposRows;
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
  weekNumber,
  nightAssignmentsByDate,
  preassignedReposRows = [],
  warnings,
}) {
  const fixedController = findFixedControllerForGroup(group, groupEmployees);
  const dailyRestAssignments = new Map(weekDates.map((date) => [date, []]));
  const employeeRestDates = new Map(groupEmployees.map((employee) => [employee.id, []]));
  const reposTypeByEmployeeDate = new Map();
  const reservedControlReplacementByDate = new Map();
  const restTargets = new Map(
    groupEmployees.map((employee) => [employee.id, getRestDaysTarget(employee, weekNumber)])
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

  function reserveControlReplacementForRest(employee, date) {
    if (!fixedController || Number(employee.id) !== Number(fixedController.id)) {
      return;
    }

    const replacement = findControlReplacement({
      group,
      groupEmployees,
      fixedController,
      nightEmployee: getNightEmployeeForDate(date),
      restEmployeeIds: new Set(dailyRestAssignments.get(date)),
    });

    if (replacement) {
      reservedControlReplacementByDate.set(date, replacement.id);
    }
  }

  function canAssignRest(employee, date) {
    const assignedRestDates = employeeRestDates.get(employee.id);
    const dailyAssignedEmployees = dailyRestAssignments.get(date);
    const nightEmployee = getNightEmployeeForDate(date);
    const maxRestCount = getMaxRestCountForDate(date);
    const reservedControlReplacementId = reservedControlReplacementByDate.get(date);

    if (assignedRestDates.length >= restTargets.get(employee.id)) {
      return false;
    }

    if (assignedRestDates.includes(date)) {
      return false;
    }

    if (nightEmployee && Number(nightEmployee.id) === Number(employee.id)) {
      return false;
    }

    if (
      reservedControlReplacementId &&
      Number(reservedControlReplacementId) === Number(employee.id)
    ) {
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
    reserveControlReplacementForRest(employee, date);
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
      reservedControlReplacementByDate: new Map(reservedControlReplacementByDate),
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

    reservedControlReplacementByDate.clear();
    snapshot.reservedControlReplacementByDate.forEach((employeeId, date) => {
      reservedControlReplacementByDate.set(date, employeeId);
    });
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

  for (const date of weekDates) {
    const dailyAssignedEmployees = dailyRestAssignments.get(date);

    if (
      fixedController &&
      dailyAssignedEmployees.includes(fixedController.id)
    ) {
      reserveControlReplacementForRest(fixedController, date);
    }
  }

  const employeesByPriority = [...groupEmployees].sort((left, right) => {
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
          `Unable to assign 2 consecutive repos days to ${employee.prenom} ${employee.nom} in ${group.nom} safely.`
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
        `Unable to assign all requested repos days to ${employee.prenom} ${employee.nom} in ${group.nom}.`
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
      role_travail_id: roleIds.guichetCaisse,
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
          `${group.nom} has fewer than 3 employees available on ${date}.`
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
          group,
          groupEmployees,
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

function addValidationError(errors, message) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
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
  employees,
  groups,
  periods,
  roles,
  weekDates,
  activePeriodsByGroupId,
  roleIds,
  hasNightAuthorization,
  fixedControllersByGroupId,
}) {
  const errors = [];
  const employeesById = buildLookupById(employees);
  const groupsById = buildLookupById(groups);
  const periodsById = buildLookupById(periods);
  const rolesById = buildLookupById(roles);
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
  const nightRowsByDate = {};

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

      if (!getNightCycleName(employee)) {
        addValidationError(
          errors,
          `${row._date} Nuit: ${employeeName} is not one of SABER, AYOUB or YOUNESS.`
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

      if (Number(row.role_travail_id) !== Number(roleIds.guichetCaisse)) {
        addValidationError(
          errors,
          `${row._date} Nuit: role must be Guichet+Caisse, found ${role?.nom || row.role_travail_id}.`
        );
      }
    } else if (
      Number(row.role_travail_id) === Number(roleIds.guichetCaisse)
    ) {
      addValidationError(
        errors,
        `${row._date} ${period?.nom || row.periode_id}: Guichet+Caisse is not allowed outside Nuit for ${employeeName}.`
      );
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

  for (const date of weekDates) {
    const nightRows = nightRowsByDate[date] || [];

    if (nightRows.length !== 1) {
      addValidationError(
        errors,
        `${date} Nuit: expected exactly one night employee, found ${nightRows.length}.`
      );
    }
  }

  for (const group of groups) {
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
        addValidationError(
          errors,
          `${date} ${shiftName} ${group.nom}: expected at least 3 employees, found ${shiftRows.length}.`
        );
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
  const rotationType = getRotationType(derivedWeekNumber);
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
    const caisse = findByNormalizedName(roles, "Caisse");
    const controle =
      findByNormalizedNames(roles, ["Contrôle", "Controle"]) ||
      roles.find((role) => normalizeText(role.nom).startsWith("CONTROLE"));
    const guichetCaisse = findByNormalizedName(roles, "Guichet+Caisse");

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

    if (!guichet || !caisse || !controle || !guichetCaisse) {
      throw new PlanningGenerationError(
        400,
        "Required work roles Guichet, Caisse, Contrôle and Guichet+Caisse were not found. Controle without accent is also supported."
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

    const employeesByGroupId = employees.reduce((result, employee) => {
      if (!result[employee.groupe_id]) {
        result[employee.groupe_id] = [];
      }

      result[employee.groupe_id].push(employee);

      return result;
    }, {});
    const employeesById = employees.reduce((result, employee) => {
      result[employee.id] = employee;

      return result;
    }, {});
    const nightAssignmentsByDate = buildNightAssignments(
      weekDates,
      nightCandidates
    );
    const nightBoundaryReposRows = buildNightBoundaryRepos(
      weekDates,
      nightCandidates,
      warnings
    );
    const nightBoundaryReposByGroupId = groupReposRowsByGroupId(
      nightBoundaryReposRows,
      employeesById
    );
    const reposByGroupId = {};
    const fixedControllersByGroupId = {};
    const generatedReposRows = [];

    for (const group of [groupA, groupB]) {
      const groupEmployees = employeesByGroupId[group.id] || [];

      if (groupEmployees.length === 0) {
        addWarning(
          warnings,
          `${group.nom} has no employees assigned.`
        );
      }

      const restAssignments = buildRestAssignmentsForGroup({
        group,
        groupEmployees,
        weekDates,
        weekNumber: derivedWeekNumber,
        nightAssignmentsByDate,
        preassignedReposRows: nightBoundaryReposByGroupId[group.id] || [],
        warnings,
      });

      reposByGroupId[group.id] = restAssignments.reposByDate;
      fixedControllersByGroupId[group.id] = restAssignments.fixedController;
      generatedReposRows.push(...restAssignments.reposRows);
    }

    const activePeriodsByGroupId = {
      [groupA.id]: rotationType === 1 ? matin.id : soir.id,
      [groupB.id]: rotationType === 1 ? soir.id : matin.id,
    };
    const generatedPlanningRows = buildPlanningRows({
      groups: [groupA, groupB],
      employeesByGroupId,
      weekDates,
      weekNumber: derivedWeekNumber,
      activePeriodsByGroupId,
      roleIds: {
        controle: controle.id,
        guichet: guichet.id,
        caisse: caisse.id,
        guichetCaisse: guichetCaisse.id,
        nuitPeriodId: nuit.id,
      },
      nightAssignmentsByDate,
      reposByGroupId,
      fixedControllersByGroupId,
      warnings,
    });

    validateGeneratedPlanningBeforeCommit({
      planningRows: generatedPlanningRows,
      reposRows: generatedReposRows,
      employees,
      groups: [groupA, groupB],
      periods,
      roles,
      weekDates,
      activePeriodsByGroupId,
      roleIds: {
        controle: controle.id,
        guichet: guichet.id,
        caisse: caisse.id,
        guichetCaisse: guichetCaisse.id,
        nuitPeriodId: nuit.id,
      },
      hasNightAuthorization,
      fixedControllersByGroupId,
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
      planning,
      repos,
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
  generateWeeklyPlanning,
};
