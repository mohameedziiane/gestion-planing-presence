const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

const userSelectQuery = `
  SELECT
    u.id,
    u.email,
    u.mot_de_passe,
    r.nom AS role,
    e.id AS employe_id,
    e.nom,
    e.prenom,
    e.sexe,
    e.groupe_id
  FROM utilisateurs u
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN employes e ON e.utilisateur_id = u.id
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

async function getUserByEmail(email) {
  const [rows] = await db.query(
    `${userSelectQuery} WHERE LOWER(u.email) = LOWER(?) LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

function isBcryptHash(value) {
  return /^\$2[aby]\$/.test(value);
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await getUserByEmail(String(email).trim());

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    if (!isBcryptHash(user.mot_de_passe)) {
      return res.status(500).json({
        message:
          "Passwords are still stored in plain text. Run the password hashing script before using login.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.mot_de_passe);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        employe_id: user.employe_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      user: formatUser(user),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
}

function me(req, res) {
  return res.json({
    user: req.user,
  });
}

module.exports = {
  login,
  me,
};
