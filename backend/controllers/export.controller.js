const db = require("../config/db");
const {
  streamPlanningPdf,
  streamPresencePdf,
} = require("../services/pdf.service");

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

function getDateRange(query) {
  const startDate = String(query.startDate || "").trim();
  const endDate = String(query.endDate || "").trim();

  if (!startDate || !endDate) {
    return {
      error: "startDate and endDate are required",
    };
  }

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return {
      error: "startDate and endDate must be valid dates in YYYY-MM-DD format",
    };
  }

  if (startDate > endDate) {
    return {
      error: "startDate must be before or equal to endDate",
    };
  }

  return {
    value: { startDate, endDate },
  };
}

async function exportPlanningPdf(req, res) {
  try {
    const { error, value } = getDateRange(req.query);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          CONCAT(e.prenom, ' ', e.nom) AS full_name,
          g.nom AS groupe,
          DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
          pt.nom AS periode_travail,
          rt.nom AS role_travail
        FROM planning p
        JOIN employes e ON e.id = p.employe_id
        JOIN groupes g ON g.id = e.groupe_id
        JOIN periodes_travail pt ON pt.id = p.periode_id
        JOIN roles_travail rt ON rt.id = p.role_travail_id
        WHERE p._date BETWEEN ? AND ?
        ORDER BY p._date ASC, e.nom ASC, e.prenom ASC, pt.id ASC
      `,
      [value.startDate, value.endDate]
    );

    await streamPlanningPdf(res, rows, value.startDate, value.endDate);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to export planning PDF",
      });
    }
  }
}

async function exportPresencePdf(req, res) {
  try {
    const { error, value } = getDateRange(req.query);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          CONCAT(e.prenom, ' ', e.nom) AS full_name,
          DATE_FORMAT(p._date, '%Y-%m-%d') AS date,
          p.statut,
          COALESCE(TIME_FORMAT(p.heure_arrivee, '%H:%i:%s'), '-') AS heure_arrivee,
          COALESCE(p.adresse_ip, '-') AS adresse_ip
        FROM presence p
        JOIN employes e ON e.id = p.employe_id
        WHERE p._date BETWEEN ? AND ?
        ORDER BY p._date ASC, e.nom ASC, e.prenom ASC
      `,
      [value.startDate, value.endDate]
    );

    await streamPresencePdf(res, rows, value.startDate, value.endDate);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to export presence PDF",
      });
    }
  }
}

module.exports = {
  exportPlanningPdf,
  exportPresencePdf,
};
