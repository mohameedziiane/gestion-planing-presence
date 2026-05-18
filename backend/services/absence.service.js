const db = require("../config/db");
const { getCurrentCasablancaDateTime } = require("../utils/casablancaDateTime");

const STATUS_ABSENT = "Absent";
const NIGHT_SHIFT_SYNC_RELEASE_TIME = "06:00";

const absenceSelectQuery = `
  SELECT
    p.id,
    p.employe_id,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
    p.heure_arrivee,
    p.statut,
    p.adresse_ip,
    e.prenom,
    e.nom,
    e.groupe_id,
    g.nom AS groupe
  FROM presence p
  JOIN employes e ON e.id = p.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

class AbsenceServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AbsenceServiceError";
    this.statusCode = statusCode;
  }
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

function validateDateInput(value, fieldName = "date") {
  const normalizedDate = String(value || "").trim();

  if (!normalizedDate) {
    throw new AbsenceServiceError(400, `${fieldName} is required`);
  }

  if (!isValidDateString(normalizedDate)) {
    throw new AbsenceServiceError(
      400,
      `${fieldName} must be a valid date in YYYY-MM-DD format`
    );
  }

  return normalizedDate;
}

function getNextDateString(date) {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  parsedDate.setUTCDate(parsedDate.getUTCDate() + 1);

  return parsedDate.toISOString().slice(0, 10);
}

function getSyncAllowedAfterDateTime(date) {
  return `${getNextDateString(date)} ${NIGHT_SHIFT_SYNC_RELEASE_TIME}`;
}

function validateSyncDateAllowed(date) {
  const normalizedDate = validateDateInput(date);
  const currentCasablanca = getCurrentCasablancaDateTime();
  const currentDateTime = `${currentCasablanca.date} ${currentCasablanca.time.slice(
    0,
    5
  )}`;
  const allowedAfterDateTime = getSyncAllowedAfterDateTime(normalizedDate);

  if (normalizedDate > currentCasablanca.date) {
    throw new AbsenceServiceError(
      400,
      "La synchronisation des absences ne peut pas \u00eatre ex\u00e9cut\u00e9e pour une date future."
    );
  }

  if (currentDateTime < allowedAfterDateTime) {
    throw new AbsenceServiceError(
      403,
      `La synchronisation des absences pour cette date sera autoris\u00e9e apr\u00e8s la fin du service Nuit, \u00e0 partir de ${allowedAfterDateTime}.`
    );
  }

  return {
    date: normalizedDate,
    allowedAfter: allowedAfterDateTime,
  };
}

async function getAbsencesByDate(date, connection = db) {
  const normalizedDate = validateDateInput(date);
  const [rows] = await connection.query(
    `
      ${absenceSelectQuery}
      WHERE p._date = ?
        AND p.statut = ?
      ORDER BY p.employe_id ASC
    `,
    [normalizedDate, STATUS_ABSENT]
  );

  return {
    date: normalizedDate,
    absences: rows,
  };
}

async function synchronizeAbsences(date) {
  const { date: normalizedDate } = validateSyncDateAllowed(date);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [planningRows] = await connection.query(
      `
        SELECT DISTINCT p.employe_id
        FROM planning p
        JOIN roles_travail rt ON rt.id = p.role_travail_id
        WHERE p._date = ?
          AND rt.nom <> 'Repos'
        ORDER BY p.employe_id ASC
      `,
      [normalizedDate]
    );
    const planningEmployeeIds = planningRows.map((row) => Number(row.employe_id));

    if (planningEmployeeIds.length === 0) {
      await connection.commit();

      return {
        date: normalizedDate,
        createdCount: 0,
        skippedReposCount: 0,
        skippedAlreadyRegisteredCount: 0,
        totalPlannedEmployees: 0,
        absences: [],
      };
    }

    const [reposRows] = await connection.query(
      `
        SELECT DISTINCT employe_id
        FROM repos
        WHERE _date = ?
          AND employe_id IN (?)
      `,
      [normalizedDate, planningEmployeeIds]
    );
    const reposEmployeeIds = new Set(
      reposRows.map((row) => Number(row.employe_id))
    );
    const employeeIdsWithoutRepos = planningEmployeeIds.filter(
      (employeId) => !reposEmployeeIds.has(employeId)
    );

    let presenceRows = [];

    if (employeeIdsWithoutRepos.length > 0) {
      const [rows] = await connection.query(
        `
          SELECT DISTINCT employe_id
          FROM presence
          WHERE _date = ?
            AND employe_id IN (?)
        `,
        [normalizedDate, employeeIdsWithoutRepos]
      );

      presenceRows = rows;
    }

    const presenceEmployeeIds = new Set(
      presenceRows.map((row) => Number(row.employe_id))
    );
    const employeeIdsToInsert = employeeIdsWithoutRepos.filter(
      (employeId) => !presenceEmployeeIds.has(employeId)
    );

    if (employeeIdsToInsert.length > 0) {
      const valuesClause = employeeIdsToInsert
        .map(() => "(?, ?, ?, ?, ?)")
        .join(", ");
      const queryParams = employeeIdsToInsert.flatMap((employeId) => [
        employeId,
        normalizedDate,
        null,
        STATUS_ABSENT,
        null,
      ]);

      await connection.query(
        `
          INSERT INTO presence (
            employe_id,
            _date,
            heure_arrivee,
            statut,
            adresse_ip
          )
          VALUES ${valuesClause}
        `,
        queryParams
      );
    }

    const result = await getAbsencesByDate(normalizedDate, connection);

    await connection.commit();

    return {
      date: normalizedDate,
      createdCount: employeeIdsToInsert.length,
      skippedReposCount: reposEmployeeIds.size,
      skippedAlreadyRegisteredCount: presenceEmployeeIds.size,
      totalPlannedEmployees: planningEmployeeIds.length,
      absences: result.absences,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function detectAbsences(date) {
  const result = await synchronizeAbsences(date);

  return {
    message: "Absence detection completed",
    date: result.date,
    inserted_absences: result.createdCount,
    createdCount: result.createdCount,
    skippedReposCount: result.skippedReposCount,
    skippedAlreadyRegisteredCount: result.skippedAlreadyRegisteredCount,
    totalPlannedEmployees: result.totalPlannedEmployees,
    absences: result.absences,
  };
}

module.exports = {
  AbsenceServiceError,
  detectAbsences,
  getAbsencesByDate,
  synchronizeAbsences,
};
