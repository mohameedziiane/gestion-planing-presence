const db = require("../config/db");

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const STATUS_REPOS = "Repos";

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

async function getOverview(req, res) {
  try {
    const [rows] = await db.query(
      `
        SELECT
          (SELECT COUNT(*) FROM employes) AS total_employes,
          (SELECT COUNT(*) FROM groupes) AS total_groupes,
          (SELECT COUNT(*) FROM planning) AS total_planning,
          (SELECT COUNT(*) FROM presence WHERE statut = ?) AS total_presence,
          (SELECT COUNT(*) FROM presence WHERE statut = ?) AS total_absence,
          (SELECT COUNT(*) FROM repos) AS total_repos
      `,
      [STATUS_PRESENT, STATUS_ABSENT]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch overview statistics",
    });
  }
}

async function getPresenceStats(req, res) {
  try {
    const [rows] = await db.query(
      `
        SELECT
          e.id AS employe_id,
          e.prenom,
          e.nom,
          g.nom AS groupe,
          COUNT(p.id) AS total_records,
          CAST(COALESCE(SUM(CASE WHEN p.statut = ? THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS total_presence,
          CAST(COALESCE(SUM(CASE WHEN p.statut = ? THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS total_absence,
          CAST(COALESCE(SUM(CASE WHEN p.statut = ? THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS total_repos
        FROM employes e
        LEFT JOIN groupes g ON g.id = e.groupe_id
        LEFT JOIN presence p ON p.employe_id = e.id
        GROUP BY e.id, e.prenom, e.nom, g.nom
        ORDER BY e.id ASC
      `,
      [STATUS_PRESENT, STATUS_ABSENT, STATUS_REPOS]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch presence statistics",
    });
  }
}

async function getReposStats(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        e.id AS employe_id,
        e.prenom,
        e.nom,
        g.nom AS groupe,
        COUNT(r.id) AS total_repos,
        CAST(COALESCE(SUM(CASE WHEN r.type = '1j' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS total_1j,
        CAST(COALESCE(SUM(CASE WHEN r.type = '2j' THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS total_2j
      FROM employes e
      LEFT JOIN groupes g ON g.id = e.groupe_id
      LEFT JOIN repos r ON r.employe_id = e.id
      GROUP BY e.id, e.prenom, e.nom, g.nom
      ORDER BY e.id ASC
    `);

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch repos statistics",
    });
  }
}

async function getPlanningStats(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        pt.id AS periode_id,
        pt.nom AS periode_travail,
        rt.id AS role_travail_id,
        rt.nom AS role_travail,
        COUNT(p.id) AS total_planning
      FROM periodes_travail pt
      CROSS JOIN roles_travail rt
      LEFT JOIN planning p
        ON p.periode_id = pt.id
        AND p.role_travail_id = rt.id
      GROUP BY pt.id, pt.nom, rt.id, rt.nom
      ORDER BY pt.id ASC, rt.id ASC
    `);

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch planning statistics",
    });
  }
}

async function getDailyStats(req, res) {
  try {
    const date = String(req.params.date || "").trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          ? AS date,
          (SELECT COUNT(*) FROM planning WHERE _date = ?) AS total_planned,
          (SELECT COUNT(*) FROM presence WHERE _date = ? AND statut = ?) AS total_present,
          (SELECT COUNT(*) FROM presence WHERE _date = ? AND statut = ?) AS total_absent,
          (SELECT COUNT(*) FROM repos WHERE _date = ?) AS total_repos
      `,
      [date, date, date, STATUS_PRESENT, date, STATUS_ABSENT, date]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch daily statistics",
    });
  }
}

module.exports = {
  getOverview,
  getPresenceStats,
  getReposStats,
  getPlanningStats,
  getDailyStats,
};
