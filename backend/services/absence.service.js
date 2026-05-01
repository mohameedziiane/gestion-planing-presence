const db = require("../config/db");
const { sendPushToUsers } = require("./notification.service");

const STATUS_ABSENT = "Absent";

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

async function sendAbsenceNotification(date, insertedCount) {
  if (insertedCount <= 0) {
    return;
  }

  try {
    const [adminRows] = await db.query(
      `
        SELECT u.id
        FROM utilisateurs u
        JOIN roles r ON r.id = u.role_id
        WHERE r.nom = 'admin'
        ORDER BY u.id ASC
      `
    );
    const adminUserIds = adminRows.map((row) => row.id);

    if (adminUserIds.length === 0) {
      return;
    }

    await sendPushToUsers(
      adminUserIds,
      "Absence detected",
      `Absence detected: ${insertedCount} employee(s) absent on ${date}`,
      {
        type: "absence_detection",
        date,
        inserted_absences: insertedCount,
      }
    );
  } catch (error) {
    // Notification delivery must not block absence detection.
    console.error("Failed to send absence notification:", error.message);
  }
}

async function detectAbsences(date) {
  const normalizedDate = validateDateInput(date);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [plannedRows] = await connection.query(
      `
        SELECT DISTINCT
          p.employe_id,
          e.prenom,
          e.nom,
          e.groupe_id,
          g.nom AS groupe
        FROM planning p
        JOIN employes e ON e.id = p.employe_id
        JOIN groupes g ON g.id = e.groupe_id
        JOIN roles_travail rt ON rt.id = p.role_travail_id
        LEFT JOIN repos r
          ON r.employe_id = p.employe_id
          AND r._date = p._date
        WHERE p._date = ?
          AND r.id IS NULL
          AND rt.nom <> 'Repos'
        ORDER BY p.employe_id ASC
      `,
      [normalizedDate]
    );
    const [presenceRows] = await connection.query(
      `
        SELECT id, employe_id, statut
        FROM presence
        WHERE _date = ?
      `,
      [normalizedDate]
    );
    const presenceByEmployeId = new Map(
      presenceRows.map((row) => [Number(row.employe_id), row])
    );
    const absentEmployees = plannedRows.filter((employee) => {
      const presenceRecord = presenceByEmployeId.get(Number(employee.employe_id));

      return !presenceRecord;
    });

    if (absentEmployees.length > 0) {
      const valuesClause = absentEmployees.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const queryParams = absentEmployees.flatMap((employee) => [
        employee.employe_id,
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
    await sendAbsenceNotification(normalizedDate, absentEmployees.length);

    return {
      message: "Absence detection completed",
      date: normalizedDate,
      inserted_absences: absentEmployees.length,
      absences: result.absences,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  AbsenceServiceError,
  detectAbsences,
  getAbsencesByDate,
};
