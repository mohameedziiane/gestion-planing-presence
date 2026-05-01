const db = require("../config/db");
const { getMessaging } = require("../config/firebase");

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeUserIds(utilisateurIds) {
  return [...new Set(utilisateurIds.map(Number))].filter(
    (utilisateurId) => Number.isInteger(utilisateurId) && utilisateurId > 0
  );
}

function normalizeNotificationData(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return Object.entries(data).reduce((result, [key, value]) => {
    if (value === undefined || value === null) {
      return result;
    }

    result[String(key)] = String(value);

    return result;
  }, {});
}

function isInvalidTokenError(error) {
  return error && INVALID_TOKEN_ERROR_CODES.has(error.code);
}

async function getDeviceTokensByUserIds(utilisateurIds) {
  if (utilisateurIds.length === 0) {
    return [];
  }

  const placeholders = utilisateurIds.map(() => "?").join(", ");
  const [rows] = await db.query(
    `
      SELECT id, utilisateur_id, token
      FROM device_tokens
      WHERE utilisateur_id IN (${placeholders})
    `,
    utilisateurIds
  );

  return rows;
}

async function removeDeviceTokensByIds(tokenIds) {
  if (tokenIds.length === 0) {
    return;
  }

  const placeholders = tokenIds.map(() => "?").join(", ");

  await db.query(
    `DELETE FROM device_tokens WHERE id IN (${placeholders})`,
    tokenIds
  );
}

async function sendPushToUsers(utilisateurIds, title, body, data = {}) {
  const normalizedUserIds = normalizeUserIds(utilisateurIds);
  const notificationTitle = String(title || "").trim();
  const notificationBody = String(body || "").trim();

  if (normalizedUserIds.length === 0) {
    throw new Error("At least one valid utilisateurId is required");
  }

  if (!notificationTitle || !notificationBody) {
    throw new Error("title and body are required");
  }

  const tokenRows = await getDeviceTokensByUserIds(normalizedUserIds);

  if (tokenRows.length === 0) {
    return {
      requested_user_ids: normalizedUserIds,
      matched_tokens: 0,
      success_count: 0,
      failure_count: 0,
      invalid_token_count: 0,
      errors: [],
    };
  }

  const messaging = getMessaging();
  const normalizedData = normalizeNotificationData(data);
  const tokenBatches = chunkArray(tokenRows, 500);
  const invalidTokenIds = [];
  const errors = [];
  let successCount = 0;
  let failureCount = 0;

  for (const batch of tokenBatches) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((tokenRow) => tokenRow.token),
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      data: normalizedData,
    });

    response.responses.forEach((item, index) => {
      if (item.success) {
        successCount += 1;
        return;
      }

      failureCount += 1;

      const tokenRow = batch[index];

      if (isInvalidTokenError(item.error)) {
        invalidTokenIds.push(tokenRow.id);
      }

      errors.push({
        utilisateur_id: tokenRow.utilisateur_id,
        token_id: tokenRow.id,
        code: item.error?.code || "unknown",
        message: item.error?.message || "Unknown Firebase error",
      });
    });
  }

  await removeDeviceTokensByIds([...new Set(invalidTokenIds)]);

  return {
    requested_user_ids: normalizedUserIds,
    matched_tokens: tokenRows.length,
    success_count: successCount,
    failure_count: failureCount,
    invalid_token_count: [...new Set(invalidTokenIds)].length,
    errors,
  };
}

async function sendPushToUser(utilisateurId, title, body, data = {}) {
  return sendPushToUsers([utilisateurId], title, body, data);
}

module.exports = {
  sendPushToUser,
  sendPushToUsers,
};
