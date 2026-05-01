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
        e.controle_fixe,
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
        g.nom AS groupe
      FROM repos r
      JOIN employes e ON e.id = r.employe_id
      JOIN groupes g ON g.id = e.groupe_id
      WHERE r._date BETWEEN ? AND ?
      ORDER BY r._date ASC, r.employe_id ASC
    `,
    [startDate, endDate]
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

function validateNightShiftRules(planningRows, hasNightAuthorization, errors, warnings, errorDedupe, warningDedupe) {
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

  for (const planningRow of nightRows) {
    if (normalizeText(planningRow.role_travail).startsWith("CONTROLE")) {
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

function validateControlReplacement(reposRows, planningRowsByGroupDate, warnings, dedupe) {
  const fixedControlRepos = reposRows.filter(
    (reposRow) => Number(reposRow.controle_fixe) === 1
  );

  for (const reposRow of fixedControlRepos) {
    const groupPlanningRows =
      planningRowsByGroupDate[`${reposRow.date}|${reposRow.groupe_id}`] || [];
    const maleReplacementExists = groupPlanningRows.some(
      (planningRow) =>
        planningRow.sexe === "Homme" &&
        normalizeText(planningRow.periode_travail) !== "NUIT" &&
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
        `${reposRow.prenom} ${reposRow.nom} is on repos and no male replacement exists in ${reposRow.groupe}.`
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
  const [planningRows, reposRows, presenceRows] = await Promise.all([
    fetchPlanningRows(normalizedStartDate, normalizedEndDate, hasNightAuthorization),
    fetchReposRows(normalizedStartDate, normalizedEndDate),
    fetchPresenceRows(normalizedStartDate, normalizedEndDate),
  ]);

  const errors = [];
  const warnings = [];
  const errorDedupe = new Set();
  const warningDedupe = new Set();
  const reposByEmployeDate = new Map(
    reposRows.map((reposRow) => [`${reposRow.employe_id}|${reposRow.date}`, reposRow])
  );
  const planningRowsByGroupDate = planningRows.reduce((result, planningRow) => {
    const key = `${planningRow.date}|${planningRow.groupe_id}`;

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(planningRow);

    return result;
  }, {});

  validatePlanningAndReposSameDate(
    planningRows,
    reposByEmployeDate,
    errors,
    errorDedupe
  );
  validateDuplicateAssignments(planningRows, errors, errorDedupe);
  validateMinimumStaff(planningRows, warnings, warningDedupe);
  validateNightShiftRules(
    planningRows,
    hasNightAuthorization,
    errors,
    warnings,
    errorDedupe,
    warningDedupe
  );
  validateControlReplacement(
    reposRows,
    planningRowsByGroupDate,
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
    period: {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    },
    errors,
    warnings,
    summary: {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
    },
  };
}

module.exports = {
  ValidationServiceError,
  validatePlanningPeriod,
};
