const fs = require("fs/promises");
const path = require("path");

const AVATAR_DIRECTORY = path.join(__dirname, "..", "storage", "avatars");
const AVATAR_PUBLIC_PATH = "/uploads/avatars";
const MAX_AVATAR_SIZE_BYTES = 1024 * 1024;
const AVATAR_EXTENSIONS = [
  {
    extension: ".jpg",
    contentType: "image/jpeg",
  },
  {
    extension: ".jpeg",
    contentType: "image/jpeg",
  },
  {
    extension: ".png",
    contentType: "image/png",
  },
];

class AvatarStorageError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AvatarStorageError";
    this.statusCode = statusCode;
  }
}

function getAvatarFilePath(userId, extension) {
  return path.join(AVATAR_DIRECTORY, `${userId}${extension}`);
}

async function ensureAvatarDirectory() {
  await fs.mkdir(AVATAR_DIRECTORY, { recursive: true });
}

async function removeExistingAvatarFiles(userId) {
  const deletionTasks = AVATAR_EXTENSIONS.map(async ({ extension }) => {
    try {
      await fs.unlink(getAvatarFilePath(userId, extension));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  });

  await Promise.all(deletionTasks);
}

async function findAvatarFile(userId) {
  for (const avatarExtension of AVATAR_EXTENSIONS) {
    const avatarPath = getAvatarFilePath(userId, avatarExtension.extension);

    try {
      await fs.access(avatarPath);
      const stats = await fs.stat(avatarPath);

      return {
        path: avatarPath,
        publicUrl: `${AVATAR_PUBLIC_PATH}/${path.basename(avatarPath)}?v=${Math.round(
          stats.mtimeMs
        )}`,
        contentType: avatarExtension.contentType,
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return null;
}

async function getAvatarPublicUrl(userId) {
  const avatarFile = await findAvatarFile(userId);

  return avatarFile ? avatarFile.publicUrl : null;
}

function parseAvatarDataUrl(value) {
  const normalizedValue = String(value || "").trim();
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/i.exec(
    normalizedValue
  );

  if (!match) {
    throw new AvatarStorageError(
      400,
      "Avatar invalide. Utilisez une image JPEG ou PNG."
    );
  }

  const contentType = match[1].toLowerCase();
  const base64Payload = match[2];
  const buffer = Buffer.from(base64Payload, "base64");

  if (buffer.length === 0) {
    throw new AvatarStorageError(400, "Le fichier avatar est vide.");
  }

  if (buffer.length > MAX_AVATAR_SIZE_BYTES) {
    throw new AvatarStorageError(
      400,
      "L'avatar doit faire 1 Mo maximum."
    );
  }

  return {
    buffer,
    contentType,
  };
}

async function saveAvatar(userId, avatarDataUrl) {
  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new AvatarStorageError(400, "Utilisateur invalide pour l'avatar.");
  }

  const { buffer, contentType } = parseAvatarDataUrl(avatarDataUrl);
  const extension = contentType === "image/png" ? ".png" : ".jpg";
  const avatarPath = getAvatarFilePath(normalizedUserId, extension);

  await ensureAvatarDirectory();
  await removeExistingAvatarFiles(normalizedUserId);
  await fs.writeFile(avatarPath, buffer);
  const stats = await fs.stat(avatarPath);

  return {
    contentType,
    path: avatarPath,
    publicUrl: `${AVATAR_PUBLIC_PATH}/${path.basename(avatarPath)}?v=${Math.round(
      stats.mtimeMs
    )}`,
    size: buffer.length,
  };
}

module.exports = {
  AVATAR_DIRECTORY,
  AvatarStorageError,
  MAX_AVATAR_SIZE_BYTES,
  findAvatarFile,
  getAvatarPublicUrl,
  saveAvatar,
};
