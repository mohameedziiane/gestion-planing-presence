const db = require("../config/db");

const STATUS_PRESENT = "Pr\u00e9sent";
const STATUS_ABSENT = "Absent";
const STATUS_REPOS = "Repos";

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
    e.controle_fixe,
    g.nom AS groupe,
    g.nom AS groupe_nom,
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
    e.controle_fixe,
    g.nom AS groupe,
    g.nom AS groupe_nom
  FROM repos r
  JOIN employes e ON e.id = r.employe_id
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getRowsForPeriod(rows, periodName) {
  const normalizedPeriodName = normalizeText(periodName);

  return rows.filter(
    (row) => normalizeText(row.periode_travail) === normalizedPeriodName
  );
}

function getGroupSummary(rows) {
  if (rows.length === 0) {
    return "Aucun planning";
  }

  const rowsForGroupInference = rows.filter(
    (row) => Number(row.controle_fixe) !== 1
  );
  const candidateRows =
    rowsForGroupInference.length > 0 ? rowsForGroupInference : rows;
  const groupNames = [
    ...new Set(
      candidateRows.map((row) => String(row.groupe || "").trim()).filter(Boolean)
    ),
  ];

  if (groupNames.length === 0) {
    return "Groupe non defini";
  }

  return groupNames.length === 1 ? groupNames[0] : "Groupes mixtes";
}

function getEmployeeSummary(rows) {
  if (rows.length === 0) {
    return "Aucun planning";
  }

  const employeeNames = rows
    .map((row) => String(row.full_name || `${row.prenom || ""} ${row.nom || ""}`).trim())
    .filter(Boolean);

  return employeeNames.length > 0 ? employeeNames.join(", ") : "Employe non defini";
}

async function getOverview(req, res) {
  try {
    const requestedDate = String(req.query?.date || "").trim();
    const date = requestedDate || getCurrentCasablancaDateValue();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    const [[overviewRows], [planningRows], [reposRows]] = await Promise.all([
      db.query(
        `
          SELECT
            (SELECT COUNT(*) FROM employes) AS total_employes,
            (SELECT COUNT(*) FROM groupes) AS total_groupes,
            (SELECT COUNT(*) FROM planning) AS total_planning,
            (SELECT COUNT(*) FROM presence WHERE statut = ?) AS total_presence,
            (SELECT COUNT(*) FROM presence WHERE statut = ?) AS total_absence,
            (SELECT COUNT(*) FROM repos) AS total_repos,
            (SELECT COUNT(*) FROM planning WHERE _date = ?) AS total_planning_date,
            (SELECT COUNT(*) FROM presence WHERE _date = ? AND statut = ?) AS total_presence_date,
            (SELECT COUNT(*) FROM presence WHERE _date = ? AND statut = ?) AS total_absence_date,
            (SELECT COUNT(*) FROM repos WHERE _date = ?) AS total_repos_date
        `,
        [
          STATUS_PRESENT,
          STATUS_ABSENT,
          date,
          date,
          STATUS_PRESENT,
          date,
          STATUS_ABSENT,
          date,
        ]
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
    ]);

    const morningRows = getRowsForPeriod(planningRows, "Matin");
    const eveningRows = getRowsForPeriod(planningRows, "Soir");
    const nightRows = getRowsForPeriod(planningRows, "Nuit");

    return res.json({
      ...overviewRows[0],
      date,
      planning: planningRows,
      repos: reposRows,
      summary: {
        groupe_matin: getGroupSummary(morningRows),
        groupe_soir: getGroupSummary(eveningRows),
        employe_nuit: getEmployeeSummary(nightRows),
        nombre_repos: reposRows.length,
      },
    });
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
