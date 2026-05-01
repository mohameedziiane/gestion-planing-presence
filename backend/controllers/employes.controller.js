const db = require("../config/db");

const baseEmployeSelect = `
  SELECT
    e.id,
    e.prenom,
    e.nom,
    e.sexe,
    e.groupe_id,
    g.nom AS groupe,
    e.controle_fixe,
    COALESCE(e.travail_nuit_autorise, 0) AS travail_nuit_autorise,
    e.utilisateur_id
  FROM employes e
  JOIN groupes g ON e.groupe_id = g.id
`;

const allowedSexes = ["Homme", "Femme"];

function parseEmployeId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function normalizeOptionalUtilisateurId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const utilisateurId = Number(value);

  if (!Number.isInteger(utilisateurId) || utilisateurId <= 0) {
    return null;
  }

  return utilisateurId;
}

function normalizeControleFixe(value, fallbackValue = 0) {
  if (value === undefined) {
    return fallbackValue;
  }

  if (value === true || value === 1 || value === "1") {
    return 1;
  }

  if (value === false || value === 0 || value === "0") {
    return 0;
  }

  return null;
}

function normalizeTravailNuitAutorise(value, fallbackValue = 0) {
  if (value === undefined) {
    return fallbackValue;
  }

  if (value === true || value === 1 || value === "1") {
    return 1;
  }

  if (value === false || value === 0 || value === "0") {
    return 0;
  }

  return null;
}

function validateEmployePayload(payload) {
  const prenom = String(payload.prenom || "").trim();
  const nom = String(payload.nom || "").trim();
  const sexe = String(payload.sexe || "").trim();
  const groupeId = Number(payload.groupe_id);
  const utilisateurId = normalizeOptionalUtilisateurId(payload.utilisateur_id);
  const controleFixe = normalizeControleFixe(payload.controle_fixe, 0);
  const travailNuitAutorise = normalizeTravailNuitAutorise(
    payload.travail_nuit_autorise,
    0
  );

  if (!prenom || !nom || !sexe || !payload.groupe_id) {
    return {
      error: "prenom, nom, sexe and groupe_id are required",
    };
  }

  if (!allowedSexes.includes(sexe)) {
    return {
      error: "sexe must be either Homme or Femme",
    };
  }

  if (!Number.isInteger(groupeId) || groupeId <= 0) {
    return {
      error: "groupe_id must be a valid positive integer",
    };
  }

  if (
    payload.utilisateur_id !== undefined &&
    payload.utilisateur_id !== null &&
    payload.utilisateur_id !== "" &&
    utilisateurId === null
  ) {
    return {
      error: "utilisateur_id must be a valid positive integer when provided",
    };
  }

  if (controleFixe === null) {
    return {
      error: "controle_fixe must be a boolean or 0/1 value",
    };
  }

  if (travailNuitAutorise === null) {
    return {
      error: "travail_nuit_autorise must be a boolean or 0/1 value",
    };
  }

  return {
    value: {
      prenom,
      nom,
      sexe,
      groupe_id: groupeId,
      utilisateur_id: utilisateurId,
      controle_fixe: controleFixe,
      travail_nuit_autorise: travailNuitAutorise,
    },
  };
}

async function groupeExists(groupeId) {
  const [rows] = await db.query("SELECT id FROM groupes WHERE id = ? LIMIT 1", [
    groupeId,
  ]);

  return rows.length > 0;
}

async function utilisateurExists(utilisateurId) {
  const [rows] = await db.query(
    "SELECT id FROM utilisateurs WHERE id = ? LIMIT 1",
    [utilisateurId]
  );

  return rows.length > 0;
}

async function findEmployeById(id) {
  const [rows] = await db.query(`${baseEmployeSelect} WHERE e.id = ? LIMIT 1`, [
    id,
  ]);

  return rows[0] || null;
}

async function getAllEmployes(req, res) {
  try {
    if (req.user.role === "employe") {
      if (!req.user.employe_id) {
        return res.status(403).json({
          message: "Employees can only access their own data",
        });
      }

      // An employee listing request is restricted to the authenticated employee record.
      const employe = await findEmployeById(req.user.employe_id);

      return res.json(employe ? [employe] : []);
    }

    const [rows] = await db.query(`${baseEmployeSelect} ORDER BY e.id ASC`);

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch employees",
    });
  }
}

async function getEmployeById(req, res) {
  try {
    const employeId = parseEmployeId(req.params.id);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const employe = await findEmployeById(employeId);

    if (!employe) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    return res.json(employe);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch employee",
    });
  }
}

async function createEmploye(req, res) {
  try {
    const { error, value } = validateEmployePayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const groupExists = await groupeExists(value.groupe_id);

    if (!groupExists) {
      return res.status(400).json({
        message: "groupe_id does not exist",
      });
    }

    if (value.utilisateur_id !== null) {
      const userExists = await utilisateurExists(value.utilisateur_id);

      if (!userExists) {
        return res.status(400).json({
          message: "utilisateur_id does not exist",
        });
      }
    }

    const [result] = await db.query(
      `
        INSERT INTO employes (
          prenom,
          nom,
          sexe,
          groupe_id,
          utilisateur_id,
          controle_fixe,
          travail_nuit_autorise
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.prenom,
        value.nom,
        value.sexe,
        value.groupe_id,
        value.utilisateur_id,
        value.controle_fixe,
        value.travail_nuit_autorise,
      ]
    );

    const createdEmploye = await findEmployeById(result.insertId);

    return res.status(201).json({
      message: "Employee created successfully",
      employe: createdEmploye,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create employee",
    });
  }
}

async function updateEmploye(req, res) {
  try {
    const employeId = parseEmployeId(req.params.id);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const existingEmploye = await findEmployeById(employeId);

    if (!existingEmploye) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    const { error, value } = validateEmployePayload(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const groupExists = await groupeExists(value.groupe_id);

    if (!groupExists) {
      return res.status(400).json({
        message: "groupe_id does not exist",
      });
    }

    const nextUtilisateurId =
      req.body.utilisateur_id === undefined
        ? existingEmploye.utilisateur_id
        : value.utilisateur_id;
    const nextControleFixe =
      req.body.controle_fixe === undefined
        ? existingEmploye.controle_fixe
        : value.controle_fixe;
    const nextTravailNuitAutorise =
      req.body.travail_nuit_autorise === undefined
        ? existingEmploye.travail_nuit_autorise
        : value.travail_nuit_autorise;

    if (nextUtilisateurId !== null) {
      const userExists = await utilisateurExists(nextUtilisateurId);

      if (!userExists) {
        return res.status(400).json({
          message: "utilisateur_id does not exist",
        });
      }
    }

    await db.query(
      `
        UPDATE employes
        SET
          prenom = ?,
          nom = ?,
          sexe = ?,
          groupe_id = ?,
          utilisateur_id = ?,
          controle_fixe = ?,
          travail_nuit_autorise = ?
        WHERE id = ?
      `,
      [
        value.prenom,
        value.nom,
        value.sexe,
        value.groupe_id,
        nextUtilisateurId,
        nextControleFixe,
        nextTravailNuitAutorise,
        employeId,
      ]
    );

    const updatedEmploye = await findEmployeById(employeId);

    return res.json({
      message: "Employee updated successfully",
      employe: updatedEmploye,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update employee",
    });
  }
}

async function deleteEmploye(req, res) {
  try {
    const employeId = parseEmployeId(req.params.id);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const existingEmploye = await findEmployeById(employeId);

    if (!existingEmploye) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    await db.query("DELETE FROM employes WHERE id = ?", [employeId]);

    return res.json({
      message: "Employee deleted successfully",
    });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message: "Employee cannot be deleted because related records exist",
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to delete employee",
    });
  }
}

module.exports = {
  getAllEmployes,
  getEmployeById,
  createEmploye,
  updateEmploye,
  deleteEmploye,
};
