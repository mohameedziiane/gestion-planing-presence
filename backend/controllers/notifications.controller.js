const db = require("../config/db");
const { ensureAttendanceReminder } = require("../services/inAppNotification.service");

function parsePositiveInt(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

async function getNotifications(req, res) {
  try {
    await ensureAttendanceReminder(req.user);

    const [rows] = await db.query(
      `
        SELECT
          id,
          user_id,
          type,
          titre,
          message,
          lu,
          created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 30
      `,
      [req.user.id]
    );

    return res.json({
      notifications: rows,
      unread_count: rows.filter((row) => !row.lu).length,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
}

async function markNotificationAsRead(req, res) {
  try {
    const notificationId = parsePositiveInt(req.params.id);

    if (!notificationId) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    await db.query(
      `
        UPDATE notifications
        SET lu = TRUE
        WHERE id = ? AND user_id = ?
      `,
      [notificationId, req.user.id]
    );

    return res.json({ message: "Notification marquée comme lue." });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to mark notification as read",
    });
  }
}

async function markAllNotificationsAsRead(req, res) {
  try {
    await db.query(
      `
        UPDATE notifications
        SET lu = TRUE
        WHERE user_id = ?
      `,
      [req.user.id]
    );

    return res.json({ message: "Notifications marquées comme lues." });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to mark notifications as read",
    });
  }
}

module.exports = {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
};
