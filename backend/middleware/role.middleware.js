const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sendAccessError(res, status, message) {
  return res.status(status).json({ message });
}

function ensureAuthenticatedUser(req, res) {
  if (req.user) {
    return null;
  }

  return sendAccessError(res, 401, "Authentication required");
}

function ensureRoleAllowed(req, res, allowedRoles) {
  if (req.user.role === "admin") {
    return null;
  }

  if (allowedRoles.includes(req.user.role)) {
    return null;
  }

  return sendAccessError(res, 403, "Access denied");
}

function ensureDirectorReadOnly(req, res) {
  if (
    req.user.role === "directeur" &&
    !READ_ONLY_METHODS.has(req.method)
  ) {
    return sendAccessError(res, 403, "Director access is read-only");
  }

  return null;
}

function ensureEmployeeOwnData(req, res) {
  if (req.user.role !== "employe") {
    return null;
  }

  const targetEmployeId =
    req.params.employeId ||
    req.params.id ||
    req.body?.employe_id ||
    req.query?.employe_id;

  // Only apply this check on routes where the target id is explicitly an employee id.
  if (
    targetEmployeId &&
    Number(targetEmployeId) !== Number(req.user.employe_id)
  ) {
    return sendAccessError(
      res,
      403,
      "Employees can only access their own data"
    );
  }

  return null;
}

function authorizeRoleAccess(...allowedRoles) {
  return (req, res, next) => {
    const authError = ensureAuthenticatedUser(req, res);

    if (authError) {
      return authError;
    }

    const roleError = ensureRoleAllowed(req, res, allowedRoles);

    if (roleError) {
      return roleError;
    }

    const directorError = ensureDirectorReadOnly(req, res);

    if (directorError) {
      return directorError;
    }

    return next();
  };
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const authError = ensureAuthenticatedUser(req, res);

    if (authError) {
      return authError;
    }

    const roleError = ensureRoleAllowed(req, res, allowedRoles);

    if (roleError) {
      return roleError;
    }

    const directorError = ensureDirectorReadOnly(req, res);

    if (directorError) {
      return directorError;
    }

    const employeeError = ensureEmployeeOwnData(req, res);

    if (employeeError) {
      return employeeError;
    }

    return next();
  };
}

function authorizeEmployeeOnly(req, res, next) {
  const authError = ensureAuthenticatedUser(req, res);

  if (authError) {
    return authError;
  }

  if (req.user.role !== "employe") {
    return sendAccessError(res, 403, "Only employees can use pointage");
  }

  return next();
}

module.exports = {
  authorizeEmployeeOnly,
  authorizeRoleAccess,
  authorizeRoles,
};
