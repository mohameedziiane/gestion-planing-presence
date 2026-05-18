const db = require("../config/db");
const { getCurrentCasablancaDateTime } = require("../utils/casablancaDateTime");

async function createNotification(
  { userId, type, titre, message },
  connection = db
) {
  if (!userId || !type || !titre || !message) {
    return null;
  }

  const [result] = await connection.query(
    `
      INSERT INTO notifications (user_id, type, titre, message)
      VALUES (?, ?, ?, ?)
    `,
    [userId, type, titre, message]
  );

  return result.insertId;
}

async function getAdminUserIds(connection = db) {
  const [rows] = await connection.query(
    `
      SELECT u.id
      FROM utilisateurs u
      JOIN roles r ON r.id = u.role_id
      WHERE r.nom = 'admin'
      ORDER BY u.id ASC
    `
  );

  return rows.map((row) => row.id);
}

async function createNotificationsForAdmins(payload, connection = db) {
  const adminUserIds = await getAdminUserIds(connection);

  await Promise.all(
    adminUserIds.map((userId) =>
      createNotification({ ...payload, userId }, connection)
    )
  );
}

async function createNotificationsForEmployeeIds(
  employeIds,
  payload,
  connection = db
) {
  const uniqueEmployeIds = [...new Set(employeIds.map(Number).filter(Boolean))];

  if (uniqueEmployeIds.length === 0) {
    return;
  }

  const placeholders = uniqueEmployeIds.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `
      SELECT utilisateur_id
      FROM employes
      WHERE id IN (${placeholders})
        AND utilisateur_id IS NOT NULL
    `,
    uniqueEmployeIds
  );

  await Promise.all(
    rows.map((row) =>
      createNotification({ ...payload, userId: row.utilisateur_id }, connection)
    )
  );
}

async function ensureAttendanceReminder(user, connection = db) {
  if (user?.role !== "employe" || !user.employe_id) {
    return;
  }

  const { date } = getCurrentCasablancaDateTime();
  const [needRows] = await connection.query(
    `
      SELECT p.id
      FROM planning p
      JOIN roles_travail rt ON rt.id = p.role_travail_id
      LEFT JOIN repos r ON r.employe_id = p.employe_id AND r._date = p._date
      LEFT JOIN presence pr ON pr.employe_id = p.employe_id AND pr._date = p._date
      WHERE p.employe_id = ?
        AND p._date = ?
        AND rt.nom <> 'Repos'
        AND r.id IS NULL
        AND pr.id IS NULL
      LIMIT 1
    `,
    [user.employe_id, date]
  );

  if (needRows.length === 0) {
    return;
  }

  const [existingRows] = await connection.query(
    `
      SELECT id
      FROM notifications
      WHERE user_id = ?
        AND type = 'rappel_pointage'
        AND DATE(created_at) = ?
      LIMIT 1
    `,
    [user.id, date]
  );

  if (existingRows.length > 0) {
    return;
  }

  await createNotification(
    {
      userId: user.id,
      type: "rappel_pointage",
      titre: "Rappel de pointage",
      message: "Vous avez un planning aujourd'hui. Pensez à pointer votre présence.",
    },
    connection
  );
}

module.exports = {
  createNotification,
  createNotificationsForAdmins,
  createNotificationsForEmployeeIds,
  ensureAttendanceReminder,
};
