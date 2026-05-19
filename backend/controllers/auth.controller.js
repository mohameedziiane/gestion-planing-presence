const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const {
  AvatarStorageError,
  findAvatarFile,
  getAvatarPublicUrl,
  saveAvatar,
} = require("../utils/avatarStorage");

const PASSWORD_SALT_ROUNDS = 10;
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

async function formatUser(user) {
  const avatarUrl = await getAvatarPublicUrl(user.id);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    avatar_url: avatarUrl,
    avatarUrl,
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

async function getUserPasswordById(userId) {
  const [rows] = await db.query(
    `
      SELECT id, mot_de_passe
      FROM utilisateurs
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

function isBcryptHash(value) {
  return /^\$2[aby]\$/.test(value);
}

async function verifyTurnstileToken(turnstileToken, remoteIp) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey || !turnstileToken) {
    return false;
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: turnstileToken,
    });

    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();

    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return false;
  }
}

async function login(req, res) {
  try {
    const { email, password, turnstileToken } = req.body;

    if (!turnstileToken) {
      return res.status(400).json({
        message: "Veuillez valider le captcha.",
      });
    }

    const isTurnstileValid = await verifyTurnstileToken(
      String(turnstileToken),
      req.ip
    );

    if (!isTurnstileValid) {
      return res.status(400).json({
        message: "Captcha invalide. Veuillez réessayer.",
      });
    }

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
      user: await formatUser(user),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
}

async function me(req, res) {
  return res.json({
    user: await formatUser(req.user),
  });
}

async function changePassword(req, res) {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmNewPassword = String(req.body?.confirmNewPassword || "");

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        message:
          "Le mot de passe actuel, le nouveau mot de passe et la confirmation sont obligatoires.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Le nouveau mot de passe doit contenir au moins 8 caractères.",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        message: "La confirmation du nouveau mot de passe ne correspond pas.",
      });
    }

    const user = await getUserPasswordById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    if (!isBcryptHash(user.mot_de_passe)) {
      return res.status(500).json({
        message:
          "Le mot de passe actuel n'est pas encore sécurisé. Exécutez le script de hash avant la modification.",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.mot_de_passe
    );

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        message: "Le mot de passe actuel est incorrect.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

    await db.query("UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?", [
      hashedPassword,
      req.user.id,
    ]);

    return res.json({
      message: "Mot de passe mis à jour avec succès.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Impossible de mettre à jour le mot de passe.",
    });
  }
}

async function getMyAvatar(req, res) {
  try {
    const avatarFile = await findAvatarFile(req.user.id);

    if (!avatarFile) {
      return res.status(404).json({
        message: "Aucun avatar enregistré.",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.type(avatarFile.contentType);

    return res.sendFile(avatarFile.path);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Impossible de charger l'avatar.",
    });
  }
}

async function updateAvatar(req, res) {
  try {
    const avatarDataUrl = req.body?.avatarDataUrl;

    if (!avatarDataUrl) {
      return res.status(400).json({
        message: "Le fichier avatar est obligatoire.",
      });
    }

    const savedAvatar = await saveAvatar(req.user.id, avatarDataUrl);
    const user = {
      ...req.user,
      avatar_url: savedAvatar.publicUrl,
      avatarUrl: savedAvatar.publicUrl,
    };

    return res.json({
      message: "Avatar mis à jour avec succès.",
      avatarUrl: savedAvatar.publicUrl,
      avatar_url: savedAvatar.publicUrl,
      user,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AvatarStorageError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Impossible de mettre à jour l'avatar.",
    });
  }
}

module.exports = {
  changePassword,
  getMyAvatar,
  login,
  me,
  updateAvatar,
};
