const db = require("../config/db");

const reposSelectQuery = `
  SELECT
    r.id,
    r.employe_id,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS date,
    r.type,
    e.prenom,
    e.nom,
    e.groupe_id,
    g.nom AS groupe
  FROM repos r
  JOIN employes e ON e.id = r.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

const allowedTypes = new Set(["1j", "2j"]);

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

function validateReposPayload(payload) {
  const employeId = parsePositiveInt(payload.employe_id);
  const date = String(payload._date || "").trim();
  const type = String(payload.type || "").trim();

  if (
    payload.employe_id === undefined ||
    payload._date === undefined ||
    payload.type === undefined
  ) {
    return {
      error: "employe_id, _date and type are required",
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

  if (!allowedTypes.has(type)) {
    return {
      error: 'type must be either "1j" or "2j"',
    };
  }

  return {
    value: {
      employe_id: employeId,
      _date: date,
      type,
    },
  };
}

async function employeExists(id) {
  const [rows] = await db.query("SELECT id FROM employes WHERE id = ? LIMIT 1", [
    id,
  ]);

  return rows.length > 0;
}

async function findReposById(id) {
  const [rows] = await db.query(`${reposSelectQuery} WHERE r.id = ? LIMIT 1`, [id]);

  return rows[0] || null;
}

async function findDuplicateRepos({ employe_id, _date, excludeId = null }) {
  const query = `
    SELECT id
    FROM repos
    WHERE employe_id = ?
      AND _date = ?
      ${excludeId ? "AND id <> ?" : ""}
    LIMIT 1
  `;
  const params = excludeId ? [employe_id, _date, excludeId] : [employe_id, _date];
  const [rows] = await db.query(query, params);

  return rows[0] || null;
}

function ensureEmployeeHasAccess(req, reposRow) {
  if (req.user.role !== "employe") {
    return null;
  }

  if (!req.user.employe_id) {
    return {
      status: 403,
      message: "Employees can only access their own repos",
    };
  }

  if (Number(reposRow.employe_id) !== Number(req.user.employe_id)) {
    return {
      status: 403,
      message: "Employees can only access their own repos",
    };
  }

  return null;
}

async function getAllRepos(req, res) {
  try {
    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own repos",
      });
    }

    const isEmploye = req.user.role === "employe";
    const [rows] = await db.query(
      `
        ${reposSelectQuery}
        ${isEmploye ? "WHERE r.employe_id = ?" : ""}
        ORDER BY r._date ASC, r.employe_id ASC
      `,
      isEmploye ? [req.user.employe_id] : []
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch repos",
    });
  }
}

async function getReposByDate(req, res) {
  try {
    const date = String(req.params.date || "").trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    if (req.user.role === "employe" && !req.user.employe_id) {
      return res.status(403).json({
        message: "Employees can only access their own repos",
      });
    }

    const isEmploye = req.user.role === "employe";
    const [rows] = await db.query(
      `
        ${reposSelectQuery}
        WHERE r._date = ?
        ${isEmploye ? "AND r.employe_id = ?" : ""}
        ORDER BY r.employe_id ASC
      `,
      isEmploye ? [date, req.user.employe_id] : [date]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch repos for date",
    });
  }
}

async function getReposByEmploye(req, res) {
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
        message: "Employees can only access their own repos",
      });
    }

    const [rows] = await db.query(
      `
        ${reposSelectQuery}
        WHERE r.employe_id = ?
        ORDER BY r._date ASC
      `,
      [employeId]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch repos for employee",
    });
  }
}

async function getReposById(req, res) {
  try {
    const reposId = parsePositiveInt(req.params.id);

    if (!reposId) {
      return res.status(400).json({
        message: "Invalid repos id",
      });
    }

    const reposRow = await findReposById(reposId);

    if (!reposRow) {
      return res.status(404).json({
        message: "Repos row not found",
      });
    }

    const accessError = ensureEmployeeHasAccess(req, reposRow);

    if (accessError) {
      return res.status(accessError.status).json({
        message: accessError.message,
      });
    }

    return res.json(reposRow);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch repos row",
    });
  }
}

async function createRepos(req, res) {
  try {
    const { error, value } = validateReposPayload(req.body);

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

    const duplicateRepos = await findDuplicateRepos(value);

    if (duplicateRepos) {
      return res.status(409).json({
        message: "A repos row already exists for this employee and date",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO repos (
          employe_id,
          _date,
          type
        )
        VALUES (?, ?, ?)
      `,
      [value.employe_id, value._date, value.type]
    );

    const createdRepos = await findReposById(result.insertId);

    return res.status(201).json({
      message: "Repos row created successfully",
      repos: createdRepos,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create repos row",
    });
  }
}

async function updateRepos(req, res) {
  try {
    const reposId = parsePositiveInt(req.params.id);

    if (!reposId) {
      return res.status(400).json({
        message: "Invalid repos id",
      });
    }

    const existingRepos = await findReposById(reposId);

    if (!existingRepos) {
      return res.status(404).json({
        message: "Repos row not found",
      });
    }

    const { error, value } = validateReposPayload(req.body);

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

    const duplicateRepos = await findDuplicateRepos({
      ...value,
      excludeId: reposId,
    });

    if (duplicateRepos) {
      return res.status(409).json({
        message: "A repos row already exists for this employee and date",
      });
    }

    await db.query(
      `
        UPDATE repos
        SET
          employe_id = ?,
          _date = ?,
          type = ?
        WHERE id = ?
      `,
      [value.employe_id, value._date, value.type, reposId]
    );

    const updatedRepos = await findReposById(reposId);

    return res.json({
      message: "Repos row updated successfully",
      repos: updatedRepos,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update repos row",
    });
  }
}

async function deleteRepos(req, res) {
  try {
    const reposId = parsePositiveInt(req.params.id);

    if (!reposId) {
      return res.status(400).json({
        message: "Invalid repos id",
      });
    }

    const existingRepos = await findReposById(reposId);

    if (!existingRepos) {
      return res.status(404).json({
        message: "Repos row not found",
      });
    }

    await db.query("DELETE FROM repos WHERE id = ?", [reposId]);

    return res.json({
      message: "Repos row deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete repos row",
    });
  }
}

module.exports = {
  getAllRepos,
  getReposByDate,
  getReposByEmploye,
  getReposById,
  createRepos,
  updateRepos,
  deleteRepos,
};
