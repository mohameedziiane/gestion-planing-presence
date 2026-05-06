const db = require("../config/db");

const ANNUAL_CONGE_DAYS = 18;
const STATUS_PENDING = "En attente";
const STATUS_VALIDATED = "Valid\u00e9";
const STATUS_REFUSED = "Refus\u00e9";
const allowedStatusFilters = new Set([
  STATUS_PENDING,
  STATUS_VALIDATED,
  STATUS_REFUSED,
]);

const certificatSelectQuery = `
  SELECT
    cm.id,
    cm.employe_id,
    DATE_FORMAT(cm.date_debut_absence, '%Y-%m-%d') AS date_debut_absence,
    DATE_FORMAT(cm.date_fin_absence, '%Y-%m-%d') AS date_fin_absence,
    cm.total_jours_absence,
    cm.jours_couverts_certificat,
    cm.jours_deduits_conge,
    cm.motif,
    cm.fichier_url,
    cm.statut,
    cm.decision_admin_id,
    cm.commentaire_admin,
    DATE_FORMAT(cm.decided_at, '%Y-%m-%d %H:%i:%s') AS decided_at,
    DATE_FORMAT(cm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(cm.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
    e.prenom,
    e.nom,
    e.groupe_id,
    g.nom AS groupe
  FROM certificats_medicaux cm
  JOIN employes e ON e.id = cm.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

function getCurrentYear() {
  return new Date().getFullYear();
}

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

function getInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function normalizeOptionalUrl(value) {
  const url = normalizeOptionalText(value);

  if (!url) {
    return { value: null };
  }

  if (url.length > 500) {
    return { error: "fichier_url must be 500 characters or fewer" };
  }

  return { value: url };
}

function ensureEmployeeAccount(req, res) {
  if (req.user.role !== "employe") {
    res.status(403).json({
      message: "Only employees can access this certificate endpoint",
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

function validateCreateCertificatPayload(payload) {
  const dateDebut = String(payload.date_debut_absence || "").trim();
  const dateFin = String(payload.date_fin_absence || "").trim();
  const joursCouverts = parsePositiveInt(payload.jours_couverts_certificat);
  const fichierUrl = normalizeOptionalUrl(payload.fichier_url);

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

  if (fichierUrl.error) {
    return { error: fichierUrl.error };
  }

  return {
    value: {
      date_debut_absence: dateDebut,
      date_fin_absence: dateFin,
      total_jours_absence: totalJoursAbsence,
      jours_couverts_certificat: joursCouverts,
      jours_deduits_conge: totalJoursAbsence - joursCouverts,
      motif: normalizeOptionalText(payload.motif),
      fichier_url: fichierUrl.value,
    },
  };
}

async function getMyCertificats(req, res) {
  try {
    const employeId = ensureEmployeeAccount(req, res);

    if (!employeId) {
      return null;
    }

    const [rows] = await db.query(
      `
        ${certificatSelectQuery}
        WHERE cm.employe_id = ?
        ORDER BY cm.created_at DESC, cm.id DESC
      `,
      [employeId]
    );

    return res.json({
      certificats: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch medical certificates",
    });
  }
}

async function createMyCertificat(req, res) {
  try {
    const employeId = ensureEmployeeAccount(req, res);

    if (!employeId) {
      return null;
    }

    const { error, value } = validateCreateCertificatPayload(req.body || {});

    if (error) {
      return res.status(400).json({ message: error });
    }

    const [result] = await db.query(
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
          statut
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employeId,
        value.date_debut_absence,
        value.date_fin_absence,
        value.total_jours_absence,
        value.jours_couverts_certificat,
        value.jours_deduits_conge,
        value.motif,
        value.fichier_url,
        STATUS_PENDING,
      ]
    );
    const [rows] = await db.query(
      `${certificatSelectQuery} WHERE cm.id = ? LIMIT 1`,
      [result.insertId]
    );

    return res.status(201).json({
      message: "Medical certificate created successfully",
      certificat: rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create medical certificate",
    });
  }
}

async function getAdminCertificats(req, res) {
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
        ${certificatSelectQuery}
        ${hasStatusFilter ? "WHERE cm.statut = ?" : ""}
        ORDER BY cm.created_at DESC, cm.id DESC
      `,
      hasStatusFilter ? [statut] : []
    );

    return res.json({
      certificats: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch admin medical certificates",
    });
  }
}

async function findCertificatForDecision(connection, certificatId) {
  const [rows] = await connection.query(
    `
      SELECT
        id,
        employe_id,
        jours_deduits_conge,
        statut
      FROM certificats_medicaux
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [certificatId]
  );

  return rows[0] || null;
}

async function validateCertificat(req, res) {
  const certificatId = parsePositiveInt(req.params.id);

  if (!certificatId) {
    return res.status(400).json({ message: "Invalid certificate id" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const certificat = await findCertificatForDecision(
      connection,
      certificatId
    );

    if (!certificat) {
      await connection.rollback();
      return res.status(404).json({ message: "Medical certificate not found" });
    }

    if (certificat.statut !== STATUS_PENDING) {
      await connection.rollback();
      return res.status(409).json({
        message: "Only pending medical certificates can be validated",
      });
    }

    if (certificat.jours_deduits_conge > 0) {
      const solde = await ensureSolde(
        certificat.employe_id,
        getCurrentYear(),
        connection
      );

      if (certificat.jours_deduits_conge > solde.jours_restants) {
        await connection.rollback();
        return res.status(400).json({
          message: "Insufficient remaining annual conge balance",
        });
      }

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
          certificat.jours_deduits_conge,
          certificat.jours_deduits_conge,
          solde.id,
          certificat.jours_deduits_conge,
        ]
      );

      if (updateResult.affectedRows !== 1) {
        await connection.rollback();
        return res.status(400).json({
          message: "Insufficient remaining annual conge balance",
        });
      }
    }

    await connection.query(
      `
        UPDATE certificats_medicaux
        SET
          statut = ?,
          decision_admin_id = ?,
          commentaire_admin = ?,
          decided_at = NOW()
        WHERE id = ?
      `,
      [
        STATUS_VALIDATED,
        req.user.id,
        normalizeOptionalText(req.body?.commentaire_admin),
        certificatId,
      ]
    );

    await connection.commit();

    return res.json({
      message: "Medical certificate validated successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      message: "Failed to validate medical certificate",
    });
  } finally {
    connection.release();
  }
}

async function refuseCertificat(req, res) {
  const certificatId = parsePositiveInt(req.params.id);

  if (!certificatId) {
    return res.status(400).json({ message: "Invalid certificate id" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const certificat = await findCertificatForDecision(
      connection,
      certificatId
    );

    if (!certificat) {
      await connection.rollback();
      return res.status(404).json({ message: "Medical certificate not found" });
    }

    if (certificat.statut !== STATUS_PENDING) {
      await connection.rollback();
      return res.status(409).json({
        message: "Only pending medical certificates can be refused",
      });
    }

    await connection.query(
      `
        UPDATE certificats_medicaux
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
        certificatId,
      ]
    );

    await connection.commit();

    return res.json({
      message: "Medical certificate refused successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      message: "Failed to refuse medical certificate",
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  createMyCertificat,
  getAdminCertificats,
  getMyCertificats,
  refuseCertificat,
  validateCertificat,
};
