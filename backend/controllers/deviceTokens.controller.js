const db = require("../config/db");
const {
  sendPushToUser,
} = require("../services/notification.service");

function parsePositiveInt(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function normalizeNotificationData(value) {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function handleDeviceTokenError(res, error, fallbackMessage) {
  if (error.code === "ER_NO_SUCH_TABLE") {
    return res.status(500).json({
      message:
        "device_tokens table is missing. Run the SQL migration before using push notifications.",
    });
  }

  console.error(error);

  return res.status(500).json({
    message: fallbackMessage,
  });
}

async function saveDeviceToken(req, res) {
  try {
    const token = normalizeToken(req.body.token);

    if (!token) {
      return res.status(400).json({
        message: "token is required",
      });
    }

    const [existingRows] = await db.query(
      "SELECT id, utilisateur_id FROM device_tokens WHERE token = ? LIMIT 1",
      [token]
    );
    const existingToken = existingRows[0];

    if (existingToken) {
      if (Number(existingToken.utilisateur_id) !== Number(req.user.id)) {
        await db.query(
          "UPDATE device_tokens SET utilisateur_id = ? WHERE id = ?",
          [req.user.id, existingToken.id]
        );
      }

      return res.json({
        message: "Device token saved successfully",
      });
    }

    await db.query(
      "INSERT INTO device_tokens (utilisateur_id, token) VALUES (?, ?)",
      [req.user.id, token]
    );

    return res.status(201).json({
      message: "Device token saved successfully",
    });
  } catch (error) {
    return handleDeviceTokenError(
      res,
      error,
      "Failed to save device token"
    );
  }
}

async function removeDeviceToken(req, res) {
  try {
    const token = normalizeToken(req.body.token);

    if (!token) {
      return res.status(400).json({
        message: "token is required",
      });
    }

    const [result] = await db.query(
      "DELETE FROM device_tokens WHERE utilisateur_id = ? AND token = ?",
      [req.user.id, token]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Device token not found",
      });
    }

    return res.json({
      message: "Device token removed successfully",
    });
  } catch (error) {
    return handleDeviceTokenError(
      res,
      error,
      "Failed to remove device token"
    );
  }
}

async function testSendNotification(req, res) {
  try {
    const utilisateurId = parsePositiveInt(req.body.utilisateur_id);
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    const data = normalizeNotificationData(req.body.data);

    if (!utilisateurId) {
      return res.status(400).json({
        message: "utilisateur_id must be a valid positive integer",
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        message: "title and body are required",
      });
    }

    if (data === null) {
      return res.status(400).json({
        message: "data must be an object when provided",
      });
    }

    const result = await sendPushToUser(utilisateurId, title, body, data);

    if (result.matched_tokens === 0) {
      return res.status(404).json({
        message: "No device tokens found for this user",
      });
    }

    return res.json({
      message: "Push notification processed",
      result,
    });
  } catch (error) {
    return handleDeviceTokenError(
      res,
      error,
      "Failed to send push notification"
    );
  }
}

module.exports = {
  saveDeviceToken,
  removeDeviceToken,
  testSendNotification,
};
