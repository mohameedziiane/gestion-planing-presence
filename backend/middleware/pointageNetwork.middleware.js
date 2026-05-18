const db = require("../config/db");
const { getClientIpDetails } = require("../utils/clientIp");

const POINTAGE_NETWORK_ERROR_MESSAGE =
  "Pointage autoris\u00e9 uniquement depuis le r\u00e9seau WiFi de la gare.";
const LOCAL_DEVELOPMENT_IPS = new Set(["127.0.0.1"]);

function isDevelopmentEnvironment() {
  return process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
}

function logDevelopmentDecision(message) {
  if (isDevelopmentEnvironment()) {
    console.log(`[pointage-network] ${message}`);
  }
}

async function requireAllowedNetworkForPointage(req, res, next) {
  try {
    const { ip, source, trustProxyEnabled } = getClientIpDetails(req);

    req.clientIp = ip;

    if (isDevelopmentEnvironment() && LOCAL_DEVELOPMENT_IPS.has(ip)) {
      logDevelopmentDecision(
        `allowed local request from ${ip} via ${source} (trust proxy: ${trustProxyEnabled})`
      );

      return next();
    }

    const [rows] = await db.query(
      `
        SELECT id
        FROM allowed_networks
        WHERE actif = TRUE
          AND ip_address = ?
        LIMIT 1
      `,
      [ip]
    );

    if (rows.length === 0) {
      logDevelopmentDecision(
        `rejected request from ${ip || "unknown"} via ${source} (trust proxy: ${trustProxyEnabled})`
      );

      return res.status(403).json({
        message: POINTAGE_NETWORK_ERROR_MESSAGE,
      });
    }

    logDevelopmentDecision(
      `allowed request from ${ip} via ${source} (trust proxy: ${trustProxyEnabled})`
    );

    return next();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to verify pointage network",
    });
  }
}

module.exports = {
  requireAllowedNetworkForPointage,
  POINTAGE_NETWORK_ERROR_MESSAGE,
};
