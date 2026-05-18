const db = require("../config/db");

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const STATUS_PENDING = "En attente";

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
    CONCAT_WS(' ', e.prenom, e.nom) AS full_name,
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

const reposSelectQuery = `
  SELECT
    r.id,
    r.employe_id,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS _date,
    DATE_FORMAT(r._date, '%Y-%m-%d') AS date,
    r.type,
    e.prenom,
    e.nom,
    CONCAT_WS(' ', e.prenom, e.nom) AS full_name,
    e.groupe_id,
    g.nom AS groupe
  FROM repos r
  JOIN employes e ON e.id = r.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

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
    CONCAT_WS(' ', e.prenom, e.nom) AS full_name,
    e.groupe_id,
    g.nom AS groupe
  FROM presence p
  JOIN employes e ON e.id = p.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

const congesPendingSelectQuery = `
  SELECT
    dc.id,
    dc.employe_id,
    DATE_FORMAT(dc.date_debut, '%Y-%m-%d') AS date_debut,
    DATE_FORMAT(dc.date_fin, '%Y-%m-%d') AS date_fin,
    dc.nombre_jours,
    dc.type_conge,
    dc.motif,
    dc.statut,
    DATE_FORMAT(dc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    e.prenom,
    e.nom,
    CONCAT_WS(' ', e.prenom, e.nom) AS full_name,
    e.groupe_id,
    g.nom AS groupe
  FROM demandes_conge dc
  JOIN employes e ON e.id = dc.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

const certificatsPendingSelectQuery = `
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
    DATE_FORMAT(cm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    e.prenom,
    e.nom,
    CONCAT_WS(' ', e.prenom, e.nom) AS full_name,
    e.groupe_id,
    g.nom AS groupe
  FROM certificats_medicaux cm
  JOIN employes e ON e.id = cm.employe_id
  JOIN groupes g ON g.id = e.groupe_id
`;

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

function getCurrentCasablancaDateValue() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function countPresenceRows(rows, status) {
  return rows.reduce((total, row) => {
    return row.statut === status ? total + 1 : total;
  }, 0);
}

async function getDashboard(req, res) {
  try {
    const requestedDate = String(req.query?.date || "").trim();
    const date = requestedDate || getCurrentCasablancaDateValue();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    const [
      [activeEmployeeCountRows],
      [planningRows],
      [reposRows],
      [presenceRows],
      [congesEnAttenteRows],
      [certificatsEnAttenteRows],
    ] = await Promise.all([
      db.query(
        `
          SELECT COUNT(*) AS total
          FROM employes
          WHERE actif = TRUE
        `
      ),
      db.query(
        `
          ${planningSelectQuery}
          WHERE p._date = ?
          ORDER BY FIELD(pt.nom, 'Matin', 'Soir', 'Nuit'), g.nom ASC, e.prenom ASC, e.nom ASC
        `,
        [date]
      ),
      db.query(
        `
          ${reposSelectQuery}
          WHERE r._date = ?
          ORDER BY g.nom ASC, e.prenom ASC, e.nom ASC
        `,
        [date]
      ),
      db.query(
        `
          ${presenceSelectQuery}
          WHERE p._date = ?
          ORDER BY p.heure_arrivee DESC, g.nom ASC, e.prenom ASC, e.nom ASC
        `,
        [date]
      ),
      db.query(
        `
          ${congesPendingSelectQuery}
          WHERE dc.statut = ?
          ORDER BY dc.created_at DESC, dc.id DESC
        `,
        [STATUS_PENDING]
      ),
      db.query(
        `
          ${certificatsPendingSelectQuery}
          WHERE cm.statut = ?
          ORDER BY cm.created_at DESC, cm.id DESC
        `,
        [STATUS_PENDING]
      ),
    ]);

    const counts = {
      employesActifs: Number(activeEmployeeCountRows[0]?.total || 0),
      planning: planningRows.length,
      presents: countPresenceRows(presenceRows, STATUS_PRESENT),
      absents: countPresenceRows(presenceRows, STATUS_ABSENT),
      repos: reposRows.length,
      congesEnAttente: congesEnAttenteRows.length,
      certificatsEnAttente: certificatsEnAttenteRows.length,
    };

    return res.json({
      date,
      counts,
      planning: planningRows,
      repos: reposRows,
      presence: presenceRows,
      congesEnAttente: congesEnAttenteRows,
      certificatsEnAttente: certificatsEnAttenteRows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch directeur dashboard",
    });
  }
}

module.exports = {
  getDashboard,
};
