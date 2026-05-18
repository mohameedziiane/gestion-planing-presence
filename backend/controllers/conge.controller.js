const db = require("../config/db");
const { createNotificationsForAdmins } = require("../services/inAppNotification.service");

const ANNUAL_CONGE_DAYS = 18;
const STATUS_PENDING = "En attente";
const STATUS_ACCEPTED = "Accept\u00e9";
const STATUS_REFUSED = "Refus\u00e9";
const STATUS_VALIDATED = "Valid\u00e9";
const TYPE_ANNUAL = "Annuel";
const TYPE_EXCEPTIONAL = "Exceptionnel";
const MEDICAL_DEDUCTION_MOTIF = "Absence m\u00e9dicale";
const allowedTypes = new Set([TYPE_ANNUAL, TYPE_EXCEPTIONAL]);
const allowedStatusFilters = new Set([
  STATUS_PENDING,
  STATUS_ACCEPTED,
  STATUS_REFUSED,
  "Annul\u00e9",
]);

const demandeSelectQuery = `
  SELECT
    dc.id,
    dc.employe_id,
    DATE_FORMAT(dc.date_debut, '%Y-%m-%d') AS date_debut,
    DATE_FORMAT(dc.date_fin, '%Y-%m-%d') AS date_fin,
    dc.nombre_jours,
    dc.type_conge,
    dc.motif,
    dc.statut,
    dc.decision_admin_id,
    dc.commentaire_admin,
    DATE_FORMAT(dc.decided_at, '%Y-%m-%d %H:%i:%s') AS decided_at,
    DATE_FORMAT(dc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(dc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
    e.prenom,
    e.nom,
    e.groupe_id,
    g.nom AS groupe
  FROM demandes_conge dc
  JOIN employes e ON e.id = dc.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

function getCurrentYear() {
  return new Date().getFullYear();
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

function getInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const millisecondsPerDay = 86400000;

  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
}

function parsePositiveInt(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

async function ensureSolde(employeId, year, connection = db) {
  await connection.query(
    `
      INSERT INTO conge_soldes (
        employe_id,
        annee,
        total_jours,
        jours_utilises,
        jours_restants
      )
      VALUES (?, ?, ?, 0, ?)
      ON DUPLICATE KEY UPDATE employe_id = employe_id
    `,
    [employeId, year, ANNUAL_CONGE_DAYS, ANNUAL_CONGE_DAYS]
  );

  const [rows] = await connection.query(
    `
      SELECT
        id,
        employe_id,
        annee,
        total_jours,
        jours_utilises,
        jours_restants
      FROM conge_soldes
      WHERE employe_id = ?
        AND annee = ?
      LIMIT 1
    `,
    [employeId, year]
  );

  return rows[0] || null;
}

function ensureEmployeeAccount(req, res) {
  if (req.user.role !== "employe") {
    res.status(403).json({
      message: "Only employees can access this conge endpoint",
    });
    return null;
  }

  if (!req.user.employe_id) {
    res.status(403).json({
      message: "Employee account is not linked to an employee record",
    });
    return null;
  }

  return req.user.employe_id;
}

async function getMySummary(req, res) {
  try {
    const employeId = ensureEmployeeAccount(req, res);

    if (!employeId) {
      return null;
    }

    const year = getCurrentYear();
    const solde = await ensureSolde(employeId, year);

    return res.json({
      annee: solde.annee,
      total_jours: solde.total_jours,
      jours_utilises: solde.jours_utilises,
      jours_restants: solde.jours_restants,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch conge summary",
    });
  }
}

async function getMyDemandes(req, res) {
  try {
    const employeId = ensureEmployeeAccount(req, res);

    if (!employeId) {
      return null;
    }

    const [rows] = await db.query(
      `
        ${demandeSelectQuery}
        WHERE dc.employe_id = ?
        ORDER BY dc.created_at DESC, dc.id DESC
      `,
      [employeId]
    );

    return res.json({
      demandes: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch conge requests",
    });
  }
}

function validateCreateDemandePayload(payload) {
  const dateDebut = String(payload.date_debut || "").trim();
  const dateFin = String(payload.date_fin || "").trim();
  const typeConge = String(payload.type_conge || TYPE_ANNUAL).trim();

  if (!isValidDateString(dateDebut) || !isValidDateString(dateFin)) {
    return {
      error: "date_debut and date_fin must be valid dates in YYYY-MM-DD format",
    };
  }

  const nombreJours = getInclusiveDays(dateDebut, dateFin);

  if (nombreJours <= 0) {
    return {
      error: "date_debut must be before or equal to date_fin",
    };
  }

  if (!allowedTypes.has(typeConge)) {
    return {
      error: "type_conge must be Annuel or Exceptionnel",
    };
  }

  return {
    value: {
      date_debut: dateDebut,
      date_fin: dateFin,
      nombre_jours: nombreJours,
      type_conge: typeConge,
      motif: normalizeOptionalText(payload.motif),
    },
  };
}

function validateMedicalDeductionPayload(payload) {
  const employeId = parsePositiveInt(payload.employe_id);
  const dateDebut = String(payload.date_debut_absence || "").trim();
  const dateFin = String(payload.date_fin_absence || "").trim();
  const joursCouverts = parsePositiveInt(payload.jours_couverts_certificat);

  if (!employeId) {
    return { error: "employe_id is required" };
  }

  if (!isValidDateString(dateDebut) || !isValidDateString(dateFin)) {
    return {
      error:
        "date_debut_absence and date_fin_absence must be valid dates in YYYY-MM-DD format",
    };
  }

  const totalJoursAbsence = getInclusiveDays(dateDebut, dateFin);

  if (totalJoursAbsence <= 0) {
    return {
      error: "date_debut_absence must be before or equal to date_fin_absence",
    };
  }

  if (!joursCouverts) {
    return {
      error: "jours_couverts_certificat must be a positive integer",
    };
  }

  if (joursCouverts > totalJoursAbsence) {
    return {
      error:
        "jours_couverts_certificat cannot exceed total absence days",
    };
  }

  return {
    value: {
      employe_id: employeId,
      date_debut_absence: dateDebut,
      date_fin_absence: dateFin,
      total_jours_absence: totalJoursAbsence,
      jours_couverts_certificat: joursCouverts,
      jours_deduits_conge: totalJoursAbsence - joursCouverts,
      commentaire_admin: normalizeOptionalText(payload.commentaire),
    },
  };
}

async function ensureEmployeeExists(connection, employeId) {
  const [rows] = await connection.query(
    `
      SELECT id
      FROM employes
      WHERE id = ?
      LIMIT 1
    `,
    [employeId]
  );

  return rows.length > 0;
}

async function createMyDemande(req, res) {
  try {
    const employeId = ensureEmployeeAccount(req, res);

    if (!employeId) {
      return null;
    }

    const { error, value } = validateCreateDemandePayload(req.body || {});

    if (error) {
      return res.status(400).json({ message: error });
    }

    const year = Number(value.date_debut.slice(0, 4));
    const solde = await ensureSolde(employeId, year);

    if (value.nombre_jours > solde.jours_restants) {
      return res.status(400).json({
        message: "Requested conge days exceed remaining annual balance",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO demandes_conge (
          employe_id,
          date_debut,
          date_fin,
          nombre_jours,
          type_conge,
          motif,
          statut
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employeId,
        value.date_debut,
        value.date_fin,
        value.nombre_jours,
        value.type_conge,
        value.motif,
        STATUS_PENDING,
      ]
    );
    const [rows] = await db.query(
      `${demandeSelectQuery} WHERE dc.id = ? LIMIT 1`,
      [result.insertId]
    );
    const demande = rows[0];

    try {
      await createNotificationsForAdmins({
        type: "demande_conge",
        titre: "Nouvelle demande de congé",
        message: `${demande.prenom} ${demande.nom} a envoyé une demande de congé.`,
      });
    } catch (notificationError) {
      console.error("Failed to create conge notification:", notificationError.message);
    }

    return res.status(201).json({
      message: "Conge request created successfully",
      demande,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create conge request",
    });
  }
}

async function getAdminDemandes(req, res) {
  try {
    const statut = String(req.query?.statut || "").trim();
    const hasStatusFilter = Boolean(statut);

    if (hasStatusFilter && !allowedStatusFilters.has(statut)) {
      return res.status(400).json({
        message: "Invalid statut filter",
      });
    }

    const [rows] = await db.query(
      `
        ${demandeSelectQuery}
        ${hasStatusFilter ? "WHERE dc.statut = ?" : ""}
        ORDER BY dc.created_at DESC, dc.id DESC
      `,
      hasStatusFilter ? [statut] : []
    );

    return res.json({
      demandes: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch admin conge requests",
    });
  }
}

async function getMedicalDeductions(req, res) {
  try {
    const [rows] = await db.query(
      `
        SELECT
          cm.id,
          cm.employe_id,
          e.prenom,
          e.nom,
          g.nom AS groupe,
          DATE_FORMAT(cm.date_debut_absence, '%Y-%m-%d') AS date_debut_absence,
          DATE_FORMAT(cm.date_fin_absence, '%Y-%m-%d') AS date_fin_absence,
          cm.total_jours_absence,
          cm.jours_couverts_certificat,
          cm.jours_deduits_conge,
          cm.commentaire_admin,
          cm.decision_admin_id,
          DATE_FORMAT(cm.decided_at, '%Y-%m-%d %H:%i:%s') AS decided_at,
          DATE_FORMAT(cm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM certificats_medicaux cm
        JOIN employes e ON e.id = cm.employe_id
        JOIN groupes g ON g.id = e.groupe_id
        WHERE cm.statut = ?
          AND cm.motif = ?
        ORDER BY cm.decided_at DESC, cm.created_at DESC, cm.id DESC
      `,
      [STATUS_VALIDATED, MEDICAL_DEDUCTION_MOTIF]
    );

    return res.json({
      deductions: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch medical deductions",
    });
  }
}

async function createMedicalDeduction(req, res) {
  const { error, value } = validateMedicalDeductionPayload(req.body || {});

  if (error) {
    return res.status(400).json({ message: error });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const employeeExists = await ensureEmployeeExists(
      connection,
      value.employe_id
    );

    if (!employeeExists) {
      await connection.rollback();
      return res.status(404).json({ message: "Employee not found" });
    }

    const year = getCurrentYear();
    const solde = await ensureSolde(value.employe_id, year, connection);

    if (value.jours_deduits_conge > solde.jours_restants) {
      await connection.rollback();
      return res.status(400).json({
        message: "Insufficient remaining annual conge balance",
      });
    }

    const [insertResult] = await connection.query(
      `
        INSERT INTO certificats_medicaux (
          employe_id,
          date_debut_absence,
          date_fin_absence,
          total_jours_absence,
          jours_couverts_certificat,
          jours_deduits_conge,
          motif,
          fichier_url,
          statut,
          decision_admin_id,
          commentaire_admin,
          decided_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NOW())
      `,
      [
        value.employe_id,
        value.date_debut_absence,
        value.date_fin_absence,
        value.total_jours_absence,
        value.jours_couverts_certificat,
        value.jours_deduits_conge,
        MEDICAL_DEDUCTION_MOTIF,
        STATUS_VALIDATED,
        req.user.id,
        value.commentaire_admin,
      ]
    );

    if (value.jours_deduits_conge > 0) {
      const [updateResult] = await connection.query(
        `
          UPDATE conge_soldes
          SET
            jours_utilises = jours_utilises + ?,
            jours_restants = jours_restants - ?
          WHERE id = ?
            AND jours_restants >= ?
        `,
        [
          value.jours_deduits_conge,
          value.jours_deduits_conge,
          solde.id,
          value.jours_deduits_conge,
        ]
      );

      if (updateResult.affectedRows !== 1) {
        await connection.rollback();
        return res.status(400).json({
          message: "Insufficient remaining annual conge balance",
        });
      }
    }

    await connection.commit();

    return res.status(201).json({
      message: "D\u00e9duction m\u00e9dicale appliqu\u00e9e avec succ\u00e8s.",
      deduction: {
        id: insertResult.insertId,
        employe_id: value.employe_id,
        total_jours_absence: value.total_jours_absence,
        jours_couverts_certificat: value.jours_couverts_certificat,
        jours_deduits_conge: value.jours_deduits_conge,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      message: "Failed to apply medical deduction",
    });
  } finally {
    connection.release();
  }
}

async function findDemandeForDecision(connection, demandeId) {
  const [rows] = await connection.query(
    `
      SELECT
        id,
        employe_id,
        DATE_FORMAT(date_debut, '%Y-%m-%d') AS date_debut,
        DATE_FORMAT(date_fin, '%Y-%m-%d') AS date_fin,
        nombre_jours,
        type_conge,
        statut
      FROM demandes_conge
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [demandeId]
  );

  return rows[0] || null;
}

async function acceptDemande(req, res) {
  const demandeId = parsePositiveInt(req.params.id);

  if (!demandeId) {
    return res.status(400).json({ message: "Invalid conge request id" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const demande = await findDemandeForDecision(connection, demandeId);

    if (!demande) {
      await connection.rollback();
      return res.status(404).json({ message: "Conge request not found" });
    }

    if (demande.statut !== STATUS_PENDING) {
      await connection.rollback();
      return res.status(409).json({
        message: "Only pending conge requests can be accepted",
      });
    }

    const year = Number(demande.date_debut.slice(0, 4));
    const solde = await ensureSolde(demande.employe_id, year, connection);

    if (demande.nombre_jours > solde.jours_restants) {
      await connection.rollback();
      return res.status(400).json({
        message: "Insufficient remaining annual conge balance",
      });
    }

    await connection.query(
      `
        UPDATE conge_soldes
        SET
          jours_utilises = jours_utilises + ?,
          jours_restants = jours_restants - ?
        WHERE id = ?
          AND jours_restants >= ?
      `,
      [
        demande.nombre_jours,
        demande.nombre_jours,
        solde.id,
        demande.nombre_jours,
      ]
    );

    await connection.query(
      `
        UPDATE demandes_conge
        SET
          statut = ?,
          decision_admin_id = ?,
          commentaire_admin = ?,
          decided_at = NOW()
        WHERE id = ?
      `,
      [
        STATUS_ACCEPTED,
        req.user.id,
        normalizeOptionalText(req.body?.commentaire_admin),
        demandeId,
      ]
    );

    await connection.commit();

    return res.json({
      message: "Conge request accepted successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      message: "Failed to accept conge request",
    });
  } finally {
    connection.release();
  }
}

async function refuseDemande(req, res) {
  const demandeId = parsePositiveInt(req.params.id);

  if (!demandeId) {
    return res.status(400).json({ message: "Invalid conge request id" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const demande = await findDemandeForDecision(connection, demandeId);

    if (!demande) {
      await connection.rollback();
      return res.status(404).json({ message: "Conge request not found" });
    }

    if (demande.statut !== STATUS_PENDING) {
      await connection.rollback();
      return res.status(409).json({
        message: "Only pending conge requests can be refused",
      });
    }

    await connection.query(
      `
        UPDATE demandes_conge
        SET
          statut = ?,
          decision_admin_id = ?,
          commentaire_admin = ?,
          decided_at = NOW()
        WHERE id = ?
      `,
      [
        STATUS_REFUSED,
        req.user.id,
        normalizeOptionalText(req.body?.commentaire_admin),
        demandeId,
      ]
    );

    await connection.commit();

    return res.json({
      message: "Conge request refused successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      message: "Failed to refuse conge request",
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  acceptDemande,
  createMedicalDeduction,
  createMyDemande,
  getAdminDemandes,
  getMedicalDeductions,
  getMyDemandes,
  getMySummary,
  refuseDemande,
};
