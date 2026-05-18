function normalizeIp(rawIp) {
  const trimmedIp = String(rawIp || "").trim();

  if (!trimmedIp) {
    return "";
  }

  if (trimmedIp === "::1") {
    return "127.0.0.1";
  }

  if (trimmedIp.startsWith("::ffff:")) {
    return trimmedIp.slice(7);
  }

  return trimmedIp;
}

function getFirstForwardedIp(forwardedForHeader) {
  if (typeof forwardedForHeader === "string" && forwardedForHeader.trim()) {
    return forwardedForHeader.split(",")[0].trim();
  }

  if (Array.isArray(forwardedForHeader) && forwardedForHeader.length > 0) {
    return String(forwardedForHeader[0] || "")
      .split(",")[0]
      .trim();
  }

  return "";
}

function isTrustProxyEnabled(req) {
  return Boolean(req.app?.get?.("trust proxy"));
}

function getClientIpDetails(req) {
  const trustProxyEnabled = isTrustProxyEnabled(req);
  const candidates = [];

  if (req.ip) {
    candidates.push({
      source: "req.ip",
      value: req.ip,
    });
  }

  if (trustProxyEnabled) {
    const forwardedIp = getFirstForwardedIp(req.headers["x-forwarded-for"]);

    if (forwardedIp) {
      candidates.push({
        source: "x-forwarded-for",
        value: forwardedIp,
      });
    }
  }

  if (req.socket?.remoteAddress) {
    candidates.push({
      source: "socket.remoteAddress",
      value: req.socket.remoteAddress,
    });
  }

  for (const candidate of candidates) {
    const normalizedIp = normalizeIp(candidate.value);

    if (normalizedIp) {
      return {
        ip: normalizedIp,
        source: candidate.source,
        trustProxyEnabled,
      };
    }
  }

  return {
    ip: "",
    source: "unavailable",
    trustProxyEnabled,
  };
}

function getClientIp(req) {
  return getClientIpDetails(req).ip;
}

module.exports = {
  getClientIp,
  getClientIpDetails,
  normalizeIp,
};
