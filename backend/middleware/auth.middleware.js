const jwt = require("jsonwebtoken");

const db = require("../config/db");

const currentUserQuery = `
  SELECT
    u.id,
    u.email,
    r.nom AS role,
    e.id AS employe_id,
    e.nom,
    e.prenom,
    e.sexe,
    e.groupe_id
  FROM utilisateurs u
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN employes e ON e.utilisateur_id = u.id
  WHERE u.id = ?
  LIMIT 1
`;

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employe_id: user.employe_id,
    employe: user.employe_id
      ? {
          id: user.employe_id,
          nom: user.nom,
          prenom: user.prenom,
          sexe: user.sexe,
          groupe_id: user.groupe_id,
        }
      : null,
  };
}

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(currentUserQuery, [decoded.id]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    req.auth = decoded;
    req.user = formatUser(user);

    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Authentication failed",
    });
  }
}

module.exports = {
  verifyToken,
};
