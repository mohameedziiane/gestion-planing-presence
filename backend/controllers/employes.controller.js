const bcrypt = require("bcryptjs");

const db = require("../config/db");
const {
  PlanningGenerationError,
  validateEmployeePlanningConfig,
} = require("../services/planningGeneration.service");

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
    e.actif,
    e.repos_base_target,
    e.ordre_nuit,
    e.controle_periode,
    e.utilisateur_id
  FROM employes e
  JOIN groupes g ON e.groupe_id = g.id
`;

const allowedSexes = ["Homme", "Femme"];
const PASSWORD_SALT_ROUNDS = 10;

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

function normalizeActif(value, fallbackValue = 1) {
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

function normalizeOptionalOrdreNuit(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const ordreNuit = Number(value);

  if (!Number.isInteger(ordreNuit) || ordreNuit <= 0) {
    return null;
  }

  return ordreNuit;
}

function normalizeOptionalControlePeriode(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const controlePeriode = String(value).trim();

  if (controlePeriode === "Matin" || controlePeriode === "Soir") {
    return controlePeriode;
  }

  return "__INVALID__";
}

function normalizeReposBaseTarget(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const reposBaseTarget = String(value).trim();

  if (reposBaseTarget === "1j" || reposBaseTarget === "2j") {
    return reposBaseTarget;
  }

  return "__INVALID__";
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

function validateEmployePlanningConfigUpdatePayload(payload, existingEmploye) {
  const errors = [];
  const nextValue = {
    sexe:
      payload.sexe === undefined
        ? existingEmploye.sexe
        : String(payload.sexe || "").trim(),
    groupe_id:
      payload.groupe_id === undefined
        ? Number(existingEmploye.groupe_id)
        : Number(payload.groupe_id),
    actif: normalizeActif(payload.actif, Number(existingEmploye.actif)),
    repos_base_target:
      payload.repos_base_target === undefined
        ? existingEmploye.repos_base_target
        : normalizeReposBaseTarget(payload.repos_base_target),
    travail_nuit_autorise: normalizeTravailNuitAutorise(
      payload.travail_nuit_autorise,
      Number(existingEmploye.travail_nuit_autorise)
    ),
    ordre_nuit:
      payload.ordre_nuit === undefined
        ? existingEmploye.ordre_nuit
        : normalizeOptionalOrdreNuit(payload.ordre_nuit),
    controle_fixe: normalizeControleFixe(
      payload.controle_fixe,
      Number(existingEmploye.controle_fixe)
    ),
    controle_periode:
      payload.controle_periode === undefined
        ? existingEmploye.controle_periode
        : normalizeOptionalControlePeriode(payload.controle_periode),
  };

  if (!allowedSexes.includes(nextValue.sexe)) {
    errors.push("sexe must be either Homme or Femme");
  }

  if (!Number.isInteger(nextValue.groupe_id) || nextValue.groupe_id <= 0) {
    errors.push("groupe_id must be a valid positive integer");
  }

  if (nextValue.actif === null) {
    errors.push("actif must be a boolean or 0/1 value");
  }

  if (nextValue.controle_fixe === null) {
    errors.push("controle_fixe must be a boolean or 0/1 value");
  }

  if (nextValue.travail_nuit_autorise === null) {
    errors.push("travail_nuit_autorise must be a boolean or 0/1 value");
  }

  if (nextValue.repos_base_target === "__INVALID__") {
    errors.push("repos_base_target must be either '1j' or '2j'");
  }

  if (nextValue.controle_periode === "__INVALID__") {
    errors.push("controle_periode must be either 'Matin', 'Soir' or null");
  }

  if (
    payload.ordre_nuit !== undefined &&
    payload.ordre_nuit !== null &&
    payload.ordre_nuit !== "" &&
    nextValue.ordre_nuit === null
  ) {
    errors.push("ordre_nuit must be a valid positive integer when provided");
  }

  if (nextValue.sexe === "Femme" && Number(payload.travail_nuit_autorise) === 1) {
    errors.push("Female employees cannot be authorized for night work");
  }

  if (
    nextValue.controle_fixe === 1 &&
    Number(payload.travail_nuit_autorise) === 1
  ) {
    errors.push("Fixed controls cannot be authorized for night work");
  }

  if (
    nextValue.travail_nuit_autorise === 1 &&
    nextValue.sexe !== "Homme"
  ) {
    errors.push("travail_nuit_autorise requires sexe = 'Homme'");
  }

  if (
    nextValue.travail_nuit_autorise === 1 &&
    nextValue.controle_fixe === 1
  ) {
    errors.push("travail_nuit_autorise requires controle_fixe = false");
  }

  if (
    nextValue.travail_nuit_autorise === 1 &&
    nextValue.ordre_nuit === null
  ) {
    errors.push("ordre_nuit is required when travail_nuit_autorise = true");
  }

  if (
    nextValue.controle_fixe === 1 &&
    !["Matin", "Soir"].includes(nextValue.controle_periode)
  ) {
    errors.push("controle_periode is required and must be 'Matin' or 'Soir' when controle_fixe = true");
  }

  if (nextValue.controle_fixe === 0 && nextValue.controle_periode !== null) {
    errors.push("controle_periode must be null when controle_fixe = false");
  }

  if (nextValue.actif === 1 && !["1j", "2j"].includes(nextValue.repos_base_target)) {
    errors.push("repos_base_target is required for active employees and must be either '1j' or '2j'");
  }

  if (errors.length > 0) {
    return { errors };
  }

  if (nextValue.sexe === "Femme" || nextValue.controle_fixe === 1) {
    nextValue.travail_nuit_autorise = 0;
    nextValue.ordre_nuit = null;
  }

  if (nextValue.controle_fixe === 0) {
    nextValue.controle_periode = null;
  }

  if (nextValue.travail_nuit_autorise === 0) {
    nextValue.ordre_nuit = null;
  }

  return { value: nextValue };
}

function validateEmployeCreationPayload(payload) {
  const errors = [];
  const value = {
    prenom: String(payload.prenom || "").trim(),
    nom: String(payload.nom || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    mot_de_passe: String(payload.mot_de_passe || ""),
    sexe: String(payload.sexe || "").trim(),
    groupe_id: Number(payload.groupe_id),
    actif: normalizeActif(payload.actif, 1),
    repos_base_target: normalizeReposBaseTarget(payload.repos_base_target),
    travail_nuit_autorise: normalizeTravailNuitAutorise(
      payload.travail_nuit_autorise,
      0
    ),
    ordre_nuit: normalizeOptionalOrdreNuit(payload.ordre_nuit),
    controle_fixe: normalizeControleFixe(payload.controle_fixe, 0),
    controle_periode: normalizeOptionalControlePeriode(payload.controle_periode),
  };

  if (!value.prenom) {
    errors.push("prenom is required");
  }

  if (!value.nom) {
    errors.push("nom is required");
  }

  if (!value.email) {
    errors.push("email is required");
  }

  if (!value.mot_de_passe) {
    errors.push("mot_de_passe is required");
  }

  if (!allowedSexes.includes(value.sexe)) {
    errors.push("sexe must be either Homme or Femme");
  }

  if (!Number.isInteger(value.groupe_id) || value.groupe_id <= 0) {
    errors.push("groupe_id must be a valid positive integer");
  }

  if (value.actif === null) {
    errors.push("actif must be a boolean or 0/1 value");
  }

  if (value.repos_base_target === null) {
    errors.push("repos_base_target is required");
  } else if (value.repos_base_target === "__INVALID__") {
    errors.push("repos_base_target must be either '1j' or '2j'");
  }

  if (value.travail_nuit_autorise === null) {
    errors.push("travail_nuit_autorise must be a boolean or 0/1 value");
  }

  if (value.controle_fixe === null) {
    errors.push("controle_fixe must be a boolean or 0/1 value");
  }

  if (value.controle_periode === "__INVALID__") {
    errors.push("controle_periode must be either 'Matin', 'Soir' or null");
  }

  if (
    payload.ordre_nuit !== undefined &&
    payload.ordre_nuit !== null &&
    payload.ordre_nuit !== "" &&
    value.ordre_nuit === null
  ) {
    errors.push("ordre_nuit must be a valid positive integer when provided");
  }

  if (
    value.controle_fixe === 1 &&
    !["Matin", "Soir"].includes(value.controle_periode)
  ) {
    errors.push("controle_periode is required and must be 'Matin' or 'Soir' when controle_fixe = true");
  }

  if (value.controle_fixe === 0 && value.controle_periode !== null) {
    errors.push("controle_periode must be null when controle_fixe = false");
  }

  if (value.sexe === "Femme" || value.controle_fixe === 1) {
    value.travail_nuit_autorise = 0;
    value.ordre_nuit = null;
  }

  if (
    value.travail_nuit_autorise === 1 &&
    value.sexe !== "Homme"
  ) {
    errors.push("travail_nuit_autorise requires sexe = 'Homme'");
  }

  if (
    value.travail_nuit_autorise === 1 &&
    value.controle_fixe === 1
  ) {
    errors.push("travail_nuit_autorise requires controle_fixe = false");
  }

  if (
    value.travail_nuit_autorise === 1 &&
    value.ordre_nuit === null
  ) {
    errors.push("ordre_nuit is required when travail_nuit_autorise = true");
  }

  if (errors.length > 0) {
    return { errors };
  }

  if (value.controle_fixe === 0) {
    value.controle_periode = null;
  }

  if (value.travail_nuit_autorise === 0) {
    value.ordre_nuit = null;
  }

  return { value };
}

async function groupeExists(groupeId, connection = db) {
  const [rows] = await connection.query("SELECT id FROM groupes WHERE id = ? LIMIT 1", [
    groupeId,
  ]);

  return rows.length > 0;
}

async function utilisateurExists(utilisateurId, connection = db) {
  const [rows] = await connection.query(
    "SELECT id FROM utilisateurs WHERE id = ? LIMIT 1",
    [utilisateurId]
  );

  return rows.length > 0;
}

async function emailExists(email, connection = db) {
  const [rows] = await connection.query(
    "SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER(?) LIMIT 1",
    [email]
  );

  return rows.length > 0;
}

async function findRoleIdByName(roleName, connection = db) {
  const [rows] = await connection.query(
    "SELECT id FROM roles WHERE LOWER(nom) = LOWER(?) LIMIT 1",
    [roleName]
  );

  return rows[0]?.id || null;
}

async function findEmployeById(id, connection = db) {
  const [rows] = await connection.query(`${baseEmployeSelect} WHERE e.id = ? LIMIT 1`, [
    id,
  ]);

  return rows[0] || null;
}

async function hasNightAuthorizationColumn(connection = db) {
  const [rows] = await connection.query(
    "SHOW COLUMNS FROM employes LIKE 'travail_nuit_autorise'"
  );

  return rows.length > 0;
}

async function fetchActiveEmployeesForPlanningConfig(connection = db) {
  const includeNightAuthorization = await hasNightAuthorizationColumn(connection);
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
        e.controle_periode,
        g.nom AS groupe
        ${nightColumnSelect}
      FROM employes e
      JOIN groupes g ON g.id = e.groupe_id
      WHERE e.actif = TRUE
      ORDER BY e.groupe_id ASC, e.id ASC
    `
  );

  return {
    employees: rows,
    hasNightAuthorization: includeNightAuthorization,
  };
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
  const connection = await db.getConnection();

  try {
    const { errors, value } = validateEmployeCreationPayload(req.body);

    if (errors) {
      return res.status(400).json({
        message: "Invalid employee creation payload",
        errors,
      });
    }

    await connection.beginTransaction();

    const groupExists = await groupeExists(value.groupe_id, connection);

    if (!groupExists) {
      await connection.rollback();
      return res.status(400).json({
        message: "groupe_id does not exist",
      });
    }

    const isEmailUsed = await emailExists(value.email, connection);

    if (isEmailUsed) {
      await connection.rollback();
      return res.status(409).json({
        message: "email already exists",
        errors: [`Email ${value.email} already exists.`],
      });
    }

    const employeeRoleId = await findRoleIdByName("employe", connection);

    if (!employeeRoleId) {
      await connection.rollback();
      return res.status(400).json({
        message: "Role employe was not found",
        errors: ["Role employe was not found."],
      });
    }

    const hashedPassword = await bcrypt.hash(
      value.mot_de_passe,
      PASSWORD_SALT_ROUNDS
    );
    const [userResult] = await connection.query(
      `
        INSERT INTO utilisateurs (
          email,
          mot_de_passe,
          role_id
        )
        VALUES (?, ?, ?)
      `,
      [value.email, hashedPassword, employeeRoleId]
    );
    const [result] = await connection.query(
      `
        INSERT INTO employes (
          prenom,
          nom,
          sexe,
          groupe_id,
          utilisateur_id,
          actif,
          repos_base_target,
          travail_nuit_autorise,
          ordre_nuit,
          controle_fixe,
          controle_periode
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.prenom,
        value.nom,
        value.sexe,
        value.groupe_id,
        userResult.insertId,
        value.actif,
        value.repos_base_target,
        value.travail_nuit_autorise,
        value.ordre_nuit,
        value.controle_fixe,
        value.controle_periode,
      ]
    );

    const { employees, hasNightAuthorization } =
      await fetchActiveEmployeesForPlanningConfig(connection);

    validateEmployeePlanningConfig(employees, hasNightAuthorization);

    const createdEmploye = await findEmployeById(result.insertId, connection);

    await connection.commit();

    return res.status(201).json({
      message: "Employé créé avec succès.",
      employee: createdEmploye,
    });
  } catch (error) {
    await connection.rollback();

    if (error instanceof PlanningGenerationError && error.statusCode === 422) {
      return res.status(422).json({
        message: "Invalid employee planning configuration.",
        errors: error.errors || [],
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "email already exists",
        errors: ["Email already exists."],
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to create employee",
    });
  } finally {
    connection.release();
  }
}

async function updateEmploye(req, res) {
  const connection = await db.getConnection();

  try {
    const employeId = parseEmployeId(req.params.id);

    if (!employeId) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    await connection.beginTransaction();

    const existingEmploye = await findEmployeById(employeId, connection);

    if (!existingEmploye) {
      await connection.rollback();
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    const { errors, value } = validateEmployePlanningConfigUpdatePayload(
      req.body,
      existingEmploye
    );

    if (errors) {
      await connection.rollback();
      return res.status(422).json({
        message: "Invalid employee planning configuration.",
        errors,
      });
    }

    const groupExists = await groupeExists(value.groupe_id, connection);

    if (!groupExists) {
      await connection.rollback();
      return res.status(400).json({
        message: "groupe_id does not exist",
      });
    }

    await connection.query(
      `
        UPDATE employes
        SET
          sexe = ?,
          groupe_id = ?,
          actif = ?,
          repos_base_target = ?,
          travail_nuit_autorise = ?,
          ordre_nuit = ?,
          controle_fixe = ?,
          controle_periode = ?
        WHERE id = ?
      `,
      [
        value.sexe,
        value.groupe_id,
        value.actif,
        value.repos_base_target,
        value.travail_nuit_autorise,
        value.ordre_nuit,
        value.controle_fixe,
        value.controle_periode,
        employeId,
      ]
    );

    const { employees, hasNightAuthorization } =
      await fetchActiveEmployeesForPlanningConfig(connection);

    validateEmployeePlanningConfig(employees, hasNightAuthorization);

    const updatedEmploye = await findEmployeById(employeId, connection);

    await connection.commit();

    return res.json({
      message: "Employé mis à jour avec succès.",
      employee: updatedEmploye,
    });
  } catch (error) {
    await connection.rollback();

    if (error instanceof PlanningGenerationError && error.statusCode === 422) {
      return res.status(422).json({
        message: "Invalid employee planning configuration.",
        errors: error.errors || [],
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to update employee",
    });
  } finally {
    connection.release();
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
