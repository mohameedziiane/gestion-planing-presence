const db = require("../config/db");

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const STATUS_REPOS = "Repos";
const allowedStatuses = new Set([STATUS_PRESENT, STATUS_ABSENT, STATUS_REPOS]);

const presenceSelectQuery = `
  SELECT
    p.id,
    p.employe_id,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
    TIME_FORMAT(p.heure_arrivee, '%H:%i:%s') AS heure_arrivee,
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

function parsePositiveInt(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
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

function normalizeOptionalTime(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmedValue)) {
    return `${trimmedValue}:00`;
  }

  if (/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(trimmedValue)) {
    return trimmedValue;
  }

  return false;
}

function normalizeOptionalIp(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (trimmedValue.length > 45) {
    return false;
  }

  return trimmedValue;
}

function validatePresencePayload(payload) {
  const employeId = parsePositiveInt(payload.employe_id);
  const date = String(payload._date || "").trim();
  const statut = String(payload.statut || "").trim();
  const heureArrivee = normalizeOptionalTime(payload.heure_arrivee);
  const adresseIp = normalizeOptionalIp(payload.adresse_ip);

  if (
    payload.employe_id === undefined ||
    payload._date === undefined ||
    payload.statut === undefined
  ) {
    return {
      error: "employe_id, _date and statut are required",
    };
  }

  if (!employeId) {
    return {
      error: "employe_id must be a valid positive integer",
    };
  }

  if (!isValidDateString(date)) {
    return {
      error: "_date must be a valid date in YYYY-MM-DD format",
    };
  }

  if (!allowedStatuses.has(statut)) {
    return {
      error: `statut must be one of: ${STATUS_PRESENT}, ${STATUS_ABSENT}, ${STATUS_REPOS}`,
    };
  }

  if (heureArrivee === false) {
    return {
      error: "heure_arrivee must be in HH:MM or HH:MM:SS format",
    };
  }

  if (adresseIp === false) {
    return {
      error: "adresse_ip is too long",
    };
  }

  return {
    value: {
      employe_id: employeId,
      _date: date,
      heure_arrivee: heureArrivee,
      statut,
      adresse_ip: adresseIp,
    },
  };
}

function getCurrentCasablancaDateTime() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

function normalizeIp(ip) {
  const trimmedIp = String(ip || "").trim();

  if (trimmedIp.startsWith("::ffff:")) {
    return trimmedIp.slice(7);
  }

  return trimmedIp;
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  let rawIp = "";

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    rawIp = forwardedFor.split(",")[0].trim();
  } else if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    rawIp = String(forwardedFor[0]).trim();
  } else {
    rawIp = req.ip || req.socket?.remoteAddress || "";
  }

  return normalizeIp(rawIp);
}

function isInternalNetwork(ip) {
  const normalizedIp = normalizeIp(ip);

  if (!normalizedIp) {
    return false;
  }

  if (normalizedIp === "::1" || normalizedIp === "127.0.0.1") {
    return true;
  }

  if (normalizedIp.startsWith("10.") || normalizedIp.startsWith("192.168.")) {
    return true;
  }

  if (normalizedIp.startsWith("172.")) {
    const segments = normalizedIp.split(".");
    const secondOctet = Number(segments[1]);

    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

async function employeExists(id) {
  const [rows] = await db.query("SELECT id FROM employes WHERE id = ? LIMIT 1", [
    id,
  ]);

  return rows.length > 0;
}

async function findPresenceById(id) {
  const [rows] = await db.query(
    `${presenceSelectQuery} WHERE p.id = ? LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function findDuplicatePresence({ employe_id, _date, excludeId = null }) {
  const query = `
    SELECT id
    FROM presence
    WHERE employe_id = ?
      AND _date = ?
      ${excludeId ? "AND id <> ?" : ""}
    LIMIT 1
  `;
  const params = excludeId
    ? [employe_id, _date, excludeId]
    : [employe_id, _date];
  const [rows] = await db.query(query, params);

  return rows[0] || null;
}

function ensureEmployeeHasAccess(req, presenceRow) {
  if (req.user.role !== "employe") {
    return null;
  }

  if (!req.user.employe_id) {
    return {
      status: 403,
      message: "Employees can only access their own presence",
    };
  }

  if (Number(presenceRow.employe_id) !== Number(req.user.employe_id)) {
    return {
      status: 403,
      message: "Employees can only access their own presence",
    };
  }

  return null;
}

async function getAllPresence(req, res) {
  try {
    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own presence",
      });
    }

    const isEmploye = req.user.role === "employe";
    const [rows] = await db.query(
      `
        ${presenceSelectQuery}
        ${isEmploye ? "WHERE p.employe_id = ?" : ""}
        ORDER BY p._date ASC, p.employe_id ASC
      `,
      isEmploye ? [req.user.employe_id] : []
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch presence records",
    });
  }
}

async function getPresenceByDate(req, res) {
  try {
    const date = String(req.params.date || "").trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own presence",
      });
    }

    const isEmploye = req.user.role === "employe";
    const [rows] = await db.query(
      `
        ${presenceSelectQuery}
        WHERE p._date = ?
        ${isEmploye ? "AND p.employe_id = ?" : ""}
        ORDER BY p.employe_id ASC
      `,
      isEmploye ? [date, req.user.employe_id] : [date]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch presence records for date",
    });
  }
}

async function getPresenceByEmploye(req, res) {
  try {
    const employeId = parsePositiveInt(req.params.employeId);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const exists = await employeExists(employeId);

    if (!exists) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    if (
      req.user.role === "employe" &&
      Number(req.user.employe_id) !== Number(employeId)
    ) {
      return res.status(403).json({
        message: "Employees can only access their own presence",
      });
    }

    const [rows] = await db.query(
      `
        ${presenceSelectQuery}
        WHERE p.employe_id = ?
        ORDER BY p._date ASC
      `,
      [employeId]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch presence records for employee",
    });
  }
}

async function getPresenceById(req, res) {
  try {
    const presenceId = parsePositiveInt(req.params.id);

    if (!presenceId) {
      return res.status(400).json({
        message: "Invalid presence id",
      });
    }

    const presenceRow = await findPresenceById(presenceId);

    if (!presenceRow) {
      return res.status(404).json({
        message: "Presence record not found",
      });
    }

    const accessError = ensureEmployeeHasAccess(req, presenceRow);

    if (accessError) {
      return res.status(accessError.status).json({
        message: accessError.message,
      });
    }

    return res.json(presenceRow);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch presence record",
    });
  }
}

async function pointerPresence(req, res) {
  try {
    if (req.user.role !== "employe") {
      return res.status(403).json({
        message: "Only employees can use pointage",
      });
    }

    if (!req.user.employe_id) {
      return res.status(403).json({
        message: "Employee account is not linked to an employee record",
      });
    }

    const clientIp = getClientIp(req);

    if (!isInternalNetwork(clientIp)) {
      return res.status(403).json({
        message: "Pointage is only allowed from the internal network",
      });
    }

    const { date, time } = getCurrentCasablancaDateTime();
    const [reposRows, planningRows, duplicateRows] = await Promise.all([
      db.query(
        "SELECT id FROM repos WHERE employe_id = ? AND _date = ? LIMIT 1",
        [req.user.employe_id, date]
      ),
      db.query(
        `
          SELECT p.id
          FROM planning p
          JOIN roles_travail rt ON rt.id = p.role_travail_id
          WHERE p.employe_id = ?
            AND p._date = ?
            AND rt.nom <> 'Repos'
          LIMIT 1
        `,
        [req.user.employe_id, date]
      ),
      db.query(
        "SELECT id FROM presence WHERE employe_id = ? AND _date = ? LIMIT 1",
        [req.user.employe_id, date]
      ),
    ]);

    if (reposRows[0].length > 0) {
      return res.status(400).json({
        message: "Employee is on repos today",
      });
    }

    if (planningRows[0].length === 0) {
      return res.status(400).json({
        message: "No planning found for today",
      });
    }

    if (duplicateRows[0].length > 0) {
      return res.status(409).json({
        message: "Presence already recorded for today",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO presence (
          employe_id,
          _date,
          heure_arrivee,
          statut,
          adresse_ip
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [req.user.employe_id, date, time, STATUS_PRESENT, clientIp]
    );

    const createdPresence = await findPresenceById(result.insertId);

    return res.status(201).json({
      message: "Attendance marked successfully",
      presence: createdPresence,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to mark attendance",
    });
  }
}

async function createPresence(req, res) {
  try {
    const { error, value } = validatePresencePayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const exists = await employeExists(value.employe_id);

    if (!exists) {
      return res.status(400).json({
        message: "employe_id does not exist",
      });
    }

    const duplicatePresence = await findDuplicatePresence(value);

    if (duplicatePresence) {
      return res.status(409).json({
        message: "A presence record already exists for this employee and date",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO presence (
          employe_id,
          _date,
          heure_arrivee,
          statut,
          adresse_ip
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        value.employe_id,
        value._date,
        value.heure_arrivee,
        value.statut,
        value.adresse_ip,
      ]
    );

    const createdPresence = await findPresenceById(result.insertId);

    return res.status(201).json({
      message: "Presence record created successfully",
      presence: createdPresence,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create presence record",
    });
  }
}

async function updatePresence(req, res) {
  try {
    const presenceId = parsePositiveInt(req.params.id);

    if (!presenceId) {
      return res.status(400).json({
        message: "Invalid presence id",
      });
    }

    const existingPresence = await findPresenceById(presenceId);

    if (!existingPresence) {
      return res.status(404).json({
        message: "Presence record not found",
      });
    }

    const { error, value } = validatePresencePayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const exists = await employeExists(value.employe_id);

    if (!exists) {
      return res.status(400).json({
        message: "employe_id does not exist",
      });
    }

    const duplicatePresence = await findDuplicatePresence({
      ...value,
      excludeId: presenceId,
    });

    if (duplicatePresence) {
      return res.status(409).json({
        message: "A presence record already exists for this employee and date",
      });
    }

    await db.query(
      `
        UPDATE presence
        SET
          employe_id = ?,
          _date = ?,
          heure_arrivee = ?,
          statut = ?,
          adresse_ip = ?
        WHERE id = ?
      `,
      [
        value.employe_id,
        value._date,
        value.heure_arrivee,
        value.statut,
        value.adresse_ip,
        presenceId,
      ]
    );

    const updatedPresence = await findPresenceById(presenceId);

    return res.json({
      message: "Presence record updated successfully",
      presence: updatedPresence,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update presence record",
    });
  }
}

async function deletePresence(req, res) {
  try {
    const presenceId = parsePositiveInt(req.params.id);

    if (!presenceId) {
      return res.status(400).json({
        message: "Invalid presence id",
      });
    }

    const existingPresence = await findPresenceById(presenceId);

    if (!existingPresence) {
      return res.status(404).json({
        message: "Presence record not found",
      });
    }

    await db.query("DELETE FROM presence WHERE id = ?", [presenceId]);

    return res.json({
      message: "Presence record deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete presence record",
    });
  }
}

module.exports = {
  getAllPresence,
  getPresenceByDate,
  getPresenceByEmploye,
  getPresenceById,
  pointerPresence,
  createPresence,
  updatePresence,
  deletePresence,
  isInternalNetwork,
};
