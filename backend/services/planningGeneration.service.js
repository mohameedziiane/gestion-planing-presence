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

function addWarning(warnings, message) {
  if (!warnings.includes(message)) {
    warnings.push(message);
  }
}

function findByNormalizedName(rows, expectedName) {
  const normalizedExpectedName = normalizeText(expectedName);

  return rows.find((row) => normalizeText(row.nom) === normalizedExpectedName);
}

function getRotationType(weekNumber) {
  return ((weekNumber - 1) % 2) + 1;
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

function buildNightCandidates(employees, hasNightAuthorization, warnings) {
  let nightCandidates = [];

  if (hasNightAuthorization) {
    nightCandidates = employees.filter(
      (employee) =>
        Number(employee.travail_nuit_autorise) === 1 &&
        Number(employee.controle_fixe) !== 1
    );
  } else {
    addWarning(
      warnings,
      "Column employes.travail_nuit_autorise is missing. Night shifts were assigned to non-fixed male employees as a fallback."
    );

    nightCandidates = employees.filter(
      (employee) =>
        employee.sexe === "Homme" && Number(employee.controle_fixe) !== 1
    );
  }

  return nightCandidates.sort((left, right) => left.id - right.id);
}

function buildNightAssignments(weekDates, nightCandidates) {
  return new Map(
    weekDates.map((date, index) => [date, nightCandidates[index % nightCandidates.length]])
  );
}

function buildRestAssignmentsForGroup({
  group,
  groupEmployees,
  weekDates,
  weekNumber,
  nightAssignmentsByDate,
  warnings,
}) {
  const fixedControllers = groupEmployees.filter(
    (employee) => Number(employee.controle_fixe) === 1
  );
  const fixedController = fixedControllers[0] || null;
  const maleBackups = groupEmployees.filter(
    (employee) =>
      employee.sexe === "Homme" && Number(employee.controle_fixe) !== 1
  );
  const dailyRestAssignments = new Map(weekDates.map((date) => [date, []]));
  const employeeRestDates = new Map(groupEmployees.map((employee) => [employee.id, []]));
  const restTargets = new Map(
    groupEmployees.map((employee) => [employee.id, getRestDaysTarget(employee, weekNumber)])
  );

  if (fixedControllers.length === 0) {
    addWarning(
      warnings,
      `${group.nom} has no fixed control employee. The generator will use male replacements when possible.`
    );
  } else if (fixedControllers.length > 1) {
    addWarning(
      warnings,
      `${group.nom} has multiple fixed control employees. The generator will use the first one by id.`
    );
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

    if (assignedRestDates.length >= restTargets.get(employee.id)) {
      return false;
    }

    if (assignedRestDates.includes(date)) {
      return false;
    }

    if (nightEmployee && Number(nightEmployee.id) === Number(employee.id)) {
      return false;
    }

    if (dailyAssignedEmployees.length >= maxRestCount) {
      return false;
    }

    if (fixedController && Number(employee.id) === Number(fixedController.id)) {
      const maleReplacementAvailable = maleBackups.some(
        (maleBackup) =>
          (!nightEmployee || Number(maleBackup.id) !== Number(nightEmployee.id)) &&
          !dailyAssignedEmployees.includes(maleBackup.id)
      );

      if (!maleReplacementAvailable) {
        return false;
      }
    }

    if (
      fixedController &&
      dailyAssignedEmployees.includes(fixedController.id) &&
      employee.sexe === "Homme" &&
      Number(employee.controle_fixe) !== 1
    ) {
      const anotherMaleReplacementAvailable = maleBackups.some(
        (maleBackup) =>
          Number(maleBackup.id) !== Number(employee.id) &&
          (!nightEmployee || Number(maleBackup.id) !== Number(nightEmployee.id)) &&
          !dailyAssignedEmployees.includes(maleBackup.id)
      );

      if (!anotherMaleReplacementAvailable) {
        return false;
      }
    }

    return true;
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

      dailyRestAssignments.get(date).push(employee.id);
      employeeRestDates.get(employee.id).push(date);

      if (employeeRestDates.get(employee.id).length >= restTargets.get(employee.id)) {
        break;
      }
    }

    if (employeeRestDates.get(employee.id).length < restTargets.get(employee.id)) {
      addWarning(
        warnings,
        `Unable to assign all requested repos days to ${employee.prenom} ${employee.nom} in ${group.nom}.`
      );
    }
  }

  const reposRows = [];

  for (const employee of groupEmployees) {
    const type = restTargets.get(employee.id) === 2 ? "2j" : "1j";

    for (const date of employeeRestDates.get(employee.id)) {
      reposRows.push({
        employe_id: employee.id,
        _date: date,
        type,
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
        controlEmployee =
          shiftEmployees.find((employee) => employee.sexe === "Homme") || null;

        if (!controlEmployee) {
          addWarning(
            warnings,
            `No male replacement is available for control in ${group.nom} on ${date}.`
          );
        }
      }

      if (controlEmployee) {
        planningRows.push({
          employe_id: controlEmployee.id,
          _date: date,
          periode_id: activePeriodsByGroupId[group.id],
          role_travail_id: roleIds.controle,
        });
      }

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
  const parsedWeekNumber = parsePositiveInt(weekNumber);

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

  if (!parsedWeekNumber) {
    throw new PlanningGenerationError(
      400,
      "weekNumber must be a valid positive integer"
    );
  }

  if (overwrite !== undefined && typeof overwrite !== "boolean") {
    throw new PlanningGenerationError(
      400,
      "overwrite must be a boolean value"
    );
  }

  const endDate = addDays(normalizedStartDate, 6);
  const weekDates = getWeekDates(normalizedStartDate);
  const rotationType = getRotationType(parsedWeekNumber);
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

    const group1 = findByNormalizedName(groups, "Groupe 1");
    const group2 = findByNormalizedName(groups, "Groupe 2");
    const matin = findByNormalizedName(periods, "Matin");
    const soir = findByNormalizedName(periods, "Soir");
    const nuit = findByNormalizedName(periods, "Nuit");
    const guichet = findByNormalizedName(roles, "Guichet");
    const caisse = findByNormalizedName(roles, "Caisse");
    const controle = roles.find(
      (role) => normalizeText(role.nom).startsWith("CONTROLE")
    );
    const guichetCaisse = findByNormalizedName(roles, "Guichet+Caisse");

    if (!group1 || !group2) {
      throw new PlanningGenerationError(
        400,
        "Required groups Groupe 1 and Groupe 2 were not found"
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
        "Required work roles Guichet, Caisse, Controle and Guichet+Caisse were not found"
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
    const nightAssignmentsByDate = buildNightAssignments(
      weekDates,
      nightCandidates
    );
    const reposByGroupId = {};
    const fixedControllersByGroupId = {};
    const generatedReposRows = [];

    for (const group of [group1, group2]) {
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
        weekNumber: parsedWeekNumber,
        nightAssignmentsByDate,
        warnings,
      });

      reposByGroupId[group.id] = restAssignments.reposByDate;
      fixedControllersByGroupId[group.id] = restAssignments.fixedController;
      generatedReposRows.push(...restAssignments.reposRows);
    }

    const activePeriodsByGroupId = {
      [group1.id]: rotationType === 1 ? matin.id : soir.id,
      [group2.id]: rotationType === 1 ? soir.id : matin.id,
    };
    const generatedPlanningRows = buildPlanningRows({
      groups: [group1, group2],
      employeesByGroupId,
      weekDates,
      weekNumber: parsedWeekNumber,
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
