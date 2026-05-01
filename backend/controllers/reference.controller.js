const db = require("../config/db");

async function fetchReferenceRows(tableName) {
  const [rows] = await db.query(`SELECT * FROM ${tableName} ORDER BY id ASC`);

  return rows;
}

async function getRoles(req, res) {
  try {
    const rows = await fetchReferenceRows("roles");

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch roles",
    });
  }
}

async function getGroupes(req, res) {
  try {
    const rows = await fetchReferenceRows("groupes");

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch groupes",
    });
  }
}

async function getPeriodesTravail(req, res) {
  try {
    const rows = await fetchReferenceRows("periodes_travail");

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch periodes_travail",
    });
  }
}

async function getRolesTravail(req, res) {
  try {
    const rows = await fetchReferenceRows("roles_travail");

    return res.json(rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch roles_travail",
    });
  }
}

async function getAllReferenceData(req, res) {
  try {
    const [roles, groupes, periodesTravail, rolesTravail] = await Promise.all([
      fetchReferenceRows("roles"),
      fetchReferenceRows("groupes"),
      fetchReferenceRows("periodes_travail"),
      fetchReferenceRows("roles_travail"),
    ]);

    return res.json({
      roles,
      groupes,
      periodes_travail: periodesTravail,
      roles_travail: rolesTravail,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch reference data",
    });
  }
}

module.exports = {
  getRoles,
  getGroupes,
  getPeriodesTravail,
  getRolesTravail,
  getAllReferenceData,
};
