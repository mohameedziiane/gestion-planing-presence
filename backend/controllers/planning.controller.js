const db = require("../config/db");
const { createNotificationsForEmployeeIds } = require("../services/inAppNotification.service");

const planningSelectQuery = `
  SELECT
    p.id,
    p.employe_id,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
    p.periode_id,
    p.role_travail_id,
    e.prenom,
    e.nom,
    e.groupe_id,
    g.nom AS groupe,
    pt.nom AS periode_travail,
    rt.nom AS role_travail
  FROM planning p
  JOIN employes e ON e.id = p.employe_id
  JOIN groupes g ON g.id = e.groupe_id
  JOIN periodes_travail pt ON pt.id = p.periode_id
  JOIN roles_travail rt ON rt.id = p.role_travail_id
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

  return !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value;
}

function validatePlanningPayload(payload) {
  const employeId = parsePositiveInt(payload.employe_id);
  const periodeId = parsePositiveInt(payload.periode_id);
  const roleTravailId = parsePositiveInt(payload.role_travail_id);
  const date = String(payload._date || "").trim();

  if (
    payload.employe_id === undefined ||
    payload._date === undefined ||
    payload.periode_id === undefined ||
    payload.role_travail_id === undefined
  ) {
    return {
      error:
        "employe_id, _date, periode_id and role_travail_id are required",
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

  if (!periodeId) {
    return {
      error: "periode_id must be a valid positive integer",
    };
  }

  if (!roleTravailId) {
    return {
      error: "role_travail_id must be a valid positive integer",
    };
  }

  return {
    value: {
      employe_id: employeId,
      _date: date,
      periode_id: periodeId,
      role_travail_id: roleTravailId,
    },
  };
}

async function recordExists(tableName, id) {
  const allowedTables = new Set([
    "employes",
    "periodes_travail",
    "roles_travail",
  ]);

  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported table lookup: ${tableName}`);
  }

  const [rows] = await db.query(`SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`, [
    id,
  ]);

  return rows.length > 0;
}

async function findPlanningById(id) {
  const [rows] = await db.query(`${planningSelectQuery} WHERE p.id = ? LIMIT 1`, [
    id,
  ]);

  return rows[0] || null;
}

async function findDuplicatePlanning({
  employe_id,
  _date,
  periode_id,
  excludeId = null,
}) {
  const query = `
    SELECT id
    FROM planning
    WHERE employe_id = ?
      AND _date = ?
      AND periode_id = ?
      ${excludeId ? "AND id <> ?" : ""}
    LIMIT 1
  `;

  const params = excludeId
    ? [employe_id, _date, periode_id, excludeId]
    : [employe_id, _date, periode_id];

  const [rows] = await db.query(query, params);

  return rows[0] || null;
}

function ensureEmployeeHasAccess(req, planningRow) {
  if (req.user.role !== "employe") {
    return null;
  }

  if (!req.user.employe_id) {
    return {
      status: 403,
      message: "Employees can only access their own planning",
    };
  }

  if (Number(planningRow.employe_id) !== Number(req.user.employe_id)) {
    return {
      status: 403,
      message: "Employees can only access their own planning",
    };
  }

  return null;
}

async function getAllPlanning(req, res) {
  try {
    const whereClause =
      req.user.role === "employe" ? "WHERE p.employe_id = ?" : "";
    const params = req.user.role === "employe" ? [req.user.employe_id] : [];

    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own planning",
      });
    }

    const [rows] = await db.query(
      `${planningSelectQuery} ${whereClause} ORDER BY p._date ASC, p.periode_id ASC, p.employe_id ASC`,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch planning",
    });
  }
}

async function getPlanningByDate(req, res) {
  try {
    const date = String(req.params.date || "").trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own planning",
      });
    }

    const isEmploye = req.user.role === "employe";
    const query = `
      ${planningSelectQuery}
      WHERE p._date = ?
      ${isEmploye ? "AND p.employe_id = ?" : ""}
      ORDER BY p.periode_id ASC, p.employe_id ASC
    `;
    const params = isEmploye ? [date, req.user.employe_id] : [date];
    const [rows] = await db.query(query, params);

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch planning for date",
    });
  }
}

async function getPlanningByEmploye(req, res) {
  try {
    const employeId = parsePositiveInt(req.params.employeId);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const employeExists = await recordExists("employes", employeId);

    if (!employeExists) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    if (
      req.user.role === "employe" &&
      Number(req.user.employe_id) !== Number(employeId)
    ) {
      return res.status(403).json({
        message: "Employees can only access their own planning",
      });
    }

    const [rows] = await db.query(
      `
        ${planningSelectQuery}
        WHERE p.employe_id = ?
        ORDER BY p._date ASC, p.periode_id ASC
      `,
      [employeId]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch planning for employee",
    });
  }
}

async function getPlanningById(req, res) {
  try {
    const planningId = parsePositiveInt(req.params.id);

    if (!planningId) {
      return res.status(400).json({
        message: "Invalid planning id",
      });
    }

    const planningRow = await findPlanningById(planningId);

    if (!planningRow) {
      return res.status(404).json({
        message: "Planning row not found",
      });
    }

    const accessError = ensureEmployeeHasAccess(req, planningRow);

    if (accessError) {
      return res.status(accessError.status).json({
        message: accessError.message,
      });
    }

    return res.json(planningRow);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch planning row",
    });
  }
}

async function createPlanning(req, res) {
  try {
    const { error, value } = validatePlanningPayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const [employeExists, periodeExists, roleTravailExists] = await Promise.all([
      recordExists("employes", value.employe_id),
      recordExists("periodes_travail", value.periode_id),
      recordExists("roles_travail", value.role_travail_id),
    ]);

    if (!employeExists) {
      return res.status(400).json({
        message: "employe_id does not exist",
      });
    }

    if (!periodeExists) {
      return res.status(400).json({
        message: "periode_id does not exist",
      });
    }

    if (!roleTravailExists) {
      return res.status(400).json({
        message: "role_travail_id does not exist",
      });
    }

    const duplicatePlanning = await findDuplicatePlanning(value);

    if (duplicatePlanning) {
      return res.status(409).json({
        message:
          "A planning row already exists for this employee, date and period",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO planning (
          employe_id,
          _date,
          periode_id,
          role_travail_id
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        value.employe_id,
        value._date,
        value.periode_id,
        value.role_travail_id,
      ]
    );

    const createdPlanning = await findPlanningById(result.insertId);

    try {
      await createNotificationsForEmployeeIds([createdPlanning.employe_id], {
        type: "planning_modifie",
        titre: "Planning mis à jour",
        message: `Votre planning du ${createdPlanning.date} a été mis à jour.`,
      });
    } catch (notificationError) {
      console.error("Failed to create planning notification:", notificationError.message);
    }

    return res.status(201).json({
      message: "Planning row created successfully",
      planning: createdPlanning,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create planning row",
    });
  }
}

async function updatePlanning(req, res) {
  try {
    const planningId = parsePositiveInt(req.params.id);

    if (!planningId) {
      return res.status(400).json({
        message: "Invalid planning id",
      });
    }

    const existingPlanning = await findPlanningById(planningId);

    if (!existingPlanning) {
      return res.status(404).json({
        message: "Planning row not found",
      });
    }

    const { error, value } = validatePlanningPayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const [employeExists, periodeExists, roleTravailExists] = await Promise.all([
      recordExists("employes", value.employe_id),
      recordExists("periodes_travail", value.periode_id),
      recordExists("roles_travail", value.role_travail_id),
    ]);

    if (!employeExists) {
      return res.status(400).json({
        message: "employe_id does not exist",
      });
    }

    if (!periodeExists) {
      return res.status(400).json({
        message: "periode_id does not exist",
      });
    }

    if (!roleTravailExists) {
      return res.status(400).json({
        message: "role_travail_id does not exist",
      });
    }

    const duplicatePlanning = await findDuplicatePlanning({
      ...value,
      excludeId: planningId,
    });

    if (duplicatePlanning) {
      return res.status(409).json({
        message:
          "A planning row already exists for this employee, date and period",
      });
    }

    await db.query(
      `
        UPDATE planning
        SET
          employe_id = ?,
          _date = ?,
          periode_id = ?,
          role_travail_id = ?
        WHERE id = ?
      `,
      [
        value.employe_id,
        value._date,
        value.periode_id,
        value.role_travail_id,
        planningId,
      ]
    );

    const updatedPlanning = await findPlanningById(planningId);

    try {
      await createNotificationsForEmployeeIds([updatedPlanning.employe_id], {
        type: "planning_modifie",
        titre: "Planning mis à jour",
        message: `Votre planning du ${updatedPlanning.date} a été mis à jour.`,
      });
    } catch (notificationError) {
      console.error("Failed to create planning notification:", notificationError.message);
    }

    return res.json({
      message: "Planning row updated successfully",
      planning: updatedPlanning,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update planning row",
    });
  }
}

async function deletePlanning(req, res) {
  try {
    const planningId = parsePositiveInt(req.params.id);

    if (!planningId) {
      return res.status(400).json({
        message: "Invalid planning id",
      });
    }

    const existingPlanning = await findPlanningById(planningId);

    if (!existingPlanning) {
      return res.status(404).json({
        message: "Planning row not found",
      });
    }

    await db.query("DELETE FROM planning WHERE id = ?", [planningId]);

    try {
      await createNotificationsForEmployeeIds([existingPlanning.employe_id], {
        type: "planning_modifie",
        titre: "Planning mis à jour",
        message: `Votre planning du ${existingPlanning.date} a été mis à jour.`,
      });
    } catch (notificationError) {
      console.error("Failed to create planning notification:", notificationError.message);
    }

    return res.json({
      message: "Planning row deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete planning row",
    });
  }
}

module.exports = {
  getAllPlanning,
  getPlanningByDate,
  getPlanningByEmploye,
  getPlanningById,
  createPlanning,
  updatePlanning,
  deletePlanning,
};
