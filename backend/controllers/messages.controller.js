const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const db = require("../config/db");
const { createNotificationsForAdmins } = require("../services/inAppNotification.service");

const MESSAGE_UPLOAD_DIRECTORY = path.join(__dirname, "..", "storage", "messages");
const MESSAGE_UPLOAD_PUBLIC_PATH = "/uploads/messages";
const MAX_MESSAGE_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const EDIT_DELETE_WINDOW_MS = 60 * 60 * 1000;
const GENERAL_GROUP_SLUG = "tous-les-employes";
const GENERAL_GROUP_TITLE = "Tous les employés";
const GENERAL_GROUP_SUBTITLE = "Groupe général";
const ALLOWED_MESSAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function parsePositiveInt(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function canManageMessages(user) {
  return user?.role === "admin" || user?.role === "directeur";
}

function isEmploye(user) {
  return user?.role === "employe";
}

function formatEmployeName(row) {
  return [row.prenom, row.nom].filter(Boolean).join(" ").trim();
}

function getMessageTypeFromMime(mimeType) {
  if (String(mimeType || "").startsWith("image/")) {
    return "image";
  }

  return "file";
}

function getSafeExtension(fileName, mimeType) {
  const extension = path.extname(String(fileName || "")).toLowerCase();

  if (/^\.[a-z0-9]{1,10}$/.test(extension)) {
    return extension;
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/gif") {
    return ".gif";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  if (mimeType === "application/pdf") {
    return ".pdf";
  }

  return ".bin";
}

function decodeBase64File(fileData) {
  const value = String(fileData || "");
  const match = value.match(/^data:([^;]+);base64,(.+)$/);

  return Buffer.from(match ? match[2] : value, "base64");
}

async function saveMessageFile({ fileData, fileName, mimeType }) {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();

  if (!ALLOWED_MESSAGE_MIME_TYPES.has(normalizedMimeType)) {
    return { error: "Type de fichier non autorisé." };
  }

  const buffer = decodeBase64File(fileData);

  if (!buffer.length) {
    return { error: "Le fichier est obligatoire." };
  }

  if (buffer.length > MAX_MESSAGE_FILE_SIZE_BYTES) {
    return { error: "Le fichier ne doit pas dépasser 8 Mo." };
  }

  await fs.mkdir(MESSAGE_UPLOAD_DIRECTORY, { recursive: true });

  const originalName = path.basename(String(fileName || "").trim()) || "message-file";
  const storedFileName = `${Date.now()}-${crypto.randomUUID()}${getSafeExtension(
    originalName,
    normalizedMimeType
  )}`;

  await fs.writeFile(path.join(MESSAGE_UPLOAD_DIRECTORY, storedFileName), buffer);

  return {
    fileUrl: `${MESSAGE_UPLOAD_PUBLIC_PATH}/${storedFileName}`,
    originalName,
    mimeType: normalizedMimeType,
    size: buffer.length,
    messageType: getMessageTypeFromMime(normalizedMimeType),
  };
}

async function findFirstAdminUserId(connection = db) {
  const [rows] = await connection.query(
    `
      SELECT u.id
      FROM utilisateurs u
      JOIN roles r ON r.id = u.role_id
      WHERE r.nom = 'admin'
      ORDER BY u.id ASC
      LIMIT 1
    `
  );

  return rows[0]?.id || null;
}

async function findEmployeForMessaging(employeId, connection = db) {
  const [rows] = await connection.query(
    `
      SELECT id, prenom, nom, utilisateur_id
      FROM employes
      WHERE id = ?
      LIMIT 1
    `,
    [employeId]
  );

  return rows[0] || null;
}

async function findConversationById(conversationId, connection = db) {
  const [rows] = await connection.query(
    `
      SELECT
        c.id,
        c.admin_id,
        c.employe_id,
        e.utilisateur_id AS employe_user_id,
        e.prenom,
        e.nom
      FROM conversations c
      JOIN employes e ON e.id = c.employe_id
      WHERE c.id = ?
      LIMIT 1
    `,
    [conversationId]
  );

  return rows[0] || null;
}

async function getOrCreateGeneralGroup(connection = db) {
  await connection.query(
    `
      INSERT INTO message_group_conversations (slug, titre, sous_titre)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE titre = VALUES(titre), sous_titre = VALUES(sous_titre)
    `,
    [GENERAL_GROUP_SLUG, GENERAL_GROUP_TITLE, GENERAL_GROUP_SUBTITLE]
  );

  const [rows] = await connection.query(
    `
      SELECT id, slug, titre, sous_titre
      FROM message_group_conversations
      WHERE slug = ?
      LIMIT 1
    `,
    [GENERAL_GROUP_SLUG]
  );

  return rows[0] || null;
}

async function getGeneralGroupConversationRow(connection = db) {
  const group = await getOrCreateGeneralGroup(connection);

  if (!group) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT
        g.id,
        g.titre,
        g.sous_titre,
        last_message.contenu AS last_message,
        last_message.created_at AS last_message_at
      FROM message_group_conversations g
      LEFT JOIN message_group_messages last_message ON last_message.id = (
        SELECT m.id
        FROM message_group_messages m
        WHERE m.group_id = g.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      )
      WHERE g.id = ?
      LIMIT 1
    `,
    [group.id]
  );

  const row = rows[0] || group;

  return {
    conversation_id: null,
    group_id: row.id,
    is_group: true,
    nom_complet: row.titre || GENERAL_GROUP_TITLE,
    last_message: row.last_message || row.sous_titre || GENERAL_GROUP_SUBTITLE,
    last_message_at: row.last_message_at,
    unread_count: 0,
  };
}

async function findMessageById(messageId, connection = db) {
  const [rows] = await connection.query(
    `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.contenu,
        m.message_type,
        m.created_at,
        m.deleted_at,
        c.admin_id,
        c.employe_id,
        e.utilisateur_id AS employe_user_id,
        e.prenom,
        e.nom
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN employes e ON e.id = c.employe_id
      WHERE m.id = ?
      LIMIT 1
    `,
    [messageId]
  );

  return rows[0] || null;
}

function canAccessConversation(user, conversation) {
  if (!user || !conversation) {
    return false;
  }

  if (canManageMessages(user)) {
    return true;
  }

  return (
    isEmploye(user) &&
    user.employe_id &&
    Number(user.employe_id) === Number(conversation.employe_id)
  );
}

async function getOrCreateConversationForEmploye(employeId, adminId, connection = db) {
  const employe = await findEmployeForMessaging(employeId, connection);

  if (!employe) {
    return { status: 404, error: "Employee not found" };
  }

  if (!employe.utilisateur_id) {
    return { status: 400, error: "Employee account is not linked to an employee record" };
  }

  const conversationAdminId = adminId || (await findFirstAdminUserId(connection));

  if (!conversationAdminId) {
    return { status: 400, error: "Admin account was not found" };
  }

  await connection.query(
    `
      INSERT INTO conversations (admin_id, employe_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE updated_at = updated_at
    `,
    [conversationAdminId, employeId]
  );

  const [rows] = await connection.query(
    `
      SELECT
        c.id,
        c.admin_id,
        c.employe_id,
        e.utilisateur_id AS employe_user_id,
        e.prenom,
        e.nom
      FROM conversations c
      JOIN employes e ON e.id = c.employe_id
      WHERE c.employe_id = ?
      LIMIT 1
    `,
    [employeId]
  );

  return { conversation: rows[0] || null };
}

async function listConversations(req, res) {
  try {
    const groupConversation = await getGeneralGroupConversationRow();

    if (canManageMessages(req.user)) {
      const [rows] = await db.query(
        `
          SELECT
            e.id AS employe_id,
            e.prenom,
            e.nom,
            e.utilisateur_id,
            c.id AS conversation_id,
            CASE
              WHEN last_message.deleted_at IS NOT NULL THEN 'Message supprimé'
              WHEN last_message.message_type = 'image' THEN 'Image'
              WHEN last_message.message_type = 'file' THEN COALESCE(last_message.file_name, 'Fichier')
              ELSE last_message.contenu
            END AS last_message,
            last_message.created_at AS last_message_at,
            COALESCE(unread.unread_count, 0) AS unread_count
          FROM employes e
          JOIN utilisateurs u ON u.id = e.utilisateur_id
          LEFT JOIN conversations c ON c.employe_id = e.id
          LEFT JOIN messages last_message ON last_message.id = (
            SELECT m.id
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
          )
          LEFT JOIN (
            SELECT conversation_id, COUNT(*) AS unread_count
            FROM messages
            WHERE lu = FALSE
              AND deleted_at IS NULL
              AND sender_user_id IN (
              SELECT utilisateur_id FROM employes WHERE utilisateur_id IS NOT NULL
            )
            GROUP BY conversation_id
          ) unread ON unread.conversation_id = c.id
          ORDER BY
            last_message.created_at IS NULL ASC,
            last_message.created_at DESC,
            e.prenom ASC,
            e.nom ASC
          LIMIT 10
        `
      );

      const directConversations = rows.map((row) => ({
          conversation_id: row.conversation_id,
          employe_id: row.employe_id,
          nom_complet: formatEmployeName(row),
          prenom: row.prenom,
          nom: row.nom,
          last_message: row.last_message || "",
          last_message_at: row.last_message_at,
          unread_count: Number(row.unread_count || 0),
        }));

      return res.json(
        groupConversation
          ? [groupConversation, ...directConversations]
          : directConversations
      );
    }

    if (isEmploye(req.user)) {
      if (!req.user.employe_id) {
        return res.status(403).json({
          message: "Employee account is not linked to an employee record",
        });
      }

      const result = await getOrCreateConversationForEmploye(
        req.user.employe_id,
        null
      );

      if (result.error) {
        return res.status(result.status || 400).json({ message: result.error });
      }

      const employeeConversations = [
        ...(groupConversation ? [groupConversation] : []),
        {
          conversation_id: result.conversation.id,
          employe_id: result.conversation.employe_id,
          nom_complet: "Admin",
        },
      ];

      return res.json(employeeConversations);
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch conversations",
    });
  }
}

async function getUnreadCount(req, res) {
  try {
    if (canManageMessages(req.user)) {
      const [rows] = await db.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          JOIN employes e ON e.id = c.employe_id
          WHERE m.lu = FALSE
            AND m.deleted_at IS NULL
            AND e.utilisateur_id IS NOT NULL
            AND m.sender_user_id = e.utilisateur_id
        `
      );

      return res.json({
        unread_count: Number(rows[0]?.unread_count || 0),
      });
    }

    if (isEmploye(req.user)) {
      if (!req.user.employe_id) {
        return res.status(403).json({
          message: "Employee account is not linked to an employee record",
        });
      }

      const [rows] = await db.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE c.employe_id = ?
            AND m.lu = FALSE
            AND m.deleted_at IS NULL
            AND m.sender_user_id <> ?
        `,
        [req.user.employe_id, req.user.id]
      );

      return res.json({
        unread_count: Number(rows[0]?.unread_count || 0),
      });
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch unread messages count",
    });
  }
}

async function createConversation(req, res) {
  try {
    if (canManageMessages(req.user)) {
      const employeId = parsePositiveInt(req.body?.employe_id);

      if (!employeId) {
        return res.status(400).json({ message: "Invalid employee id" });
      }

      const result = await getOrCreateConversationForEmploye(
        employeId,
        req.user.id
      );

      if (result.error) {
        return res.status(result.status || 400).json({ message: result.error });
      }

      return res.status(201).json({
        conversation: {
          id: result.conversation.id,
          employe_id: result.conversation.employe_id,
          nom_complet: formatEmployeName(result.conversation),
        },
      });
    }

    if (isEmploye(req.user)) {
      if (!req.user.employe_id) {
        return res.status(403).json({
          message: "Employee account is not linked to an employee record",
        });
      }

      const result = await getOrCreateConversationForEmploye(
        req.user.employe_id,
        null
      );

      if (result.error) {
        return res.status(result.status || 400).json({ message: result.error });
      }

      return res.status(201).json({
        conversation: {
          id: result.conversation.id,
          employe_id: result.conversation.employe_id,
          nom_complet: "Admin",
        },
      });
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create conversation",
    });
  }
}

async function getMessages(req, res) {
  try {
    const conversationId = parsePositiveInt(req.params.conversationId);

    if (!conversationId) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await findConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!canAccessConversation(req.user, conversation)) {
      return res.status(403).json({ message: "Employees can only access their own messages" });
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size,
          lu,
          created_at,
          updated_at,
          deleted_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, id ASC
      `,
      [conversationId]
    );

    return res.json({
      conversation: {
        id: conversation.id,
        employe_id: conversation.employe_id,
        nom_complet: canManageMessages(req.user) ? formatEmployeName(conversation) : "Admin",
      },
      messages: rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch messages",
    });
  }
}

async function sendMessage(req, res) {
  try {
    const conversationId = parsePositiveInt(req.params.conversationId);
    const contenu = String(req.body?.contenu || "").trim();

    if (!conversationId) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (!contenu) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (contenu.length > 2000) {
      return res.status(400).json({ message: "Message content is too long" });
    }

    const conversation = await findConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!canAccessConversation(req.user, conversation)) {
      return res.status(403).json({ message: "Employees can only access their own messages" });
    }

    const [result] = await db.query(
      `
        INSERT INTO messages (conversation_id, sender_user_id, contenu, message_type)
        VALUES (?, ?, ?, 'text')
      `,
      [conversationId, req.user.id, contenu]
    );

    await db.query("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      conversationId,
    ]);

    const [rows] = await db.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size,
          lu,
          created_at,
          updated_at,
          deleted_at
        FROM messages
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    if (Number(req.user.id) === Number(conversation.employe_user_id)) {
      try {
        await createNotificationsForAdmins({
          type: "message_employe",
          titre: "Nouveau message",
          message: `${formatEmployeName(conversation)} vous a envoyé un message.`,
        });
      } catch (notificationError) {
        console.error("Failed to create message notification:", notificationError.message);
      }
    }

    return res.status(201).json({
      message: "Message envoyé avec succès.",
      data: rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

async function sendAttachmentMessage(req, res) {
  try {
    const conversationId = parsePositiveInt(req.params.conversationId);

    if (!conversationId) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await findConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!canAccessConversation(req.user, conversation)) {
      return res.status(403).json({ message: "Employees can only access their own messages" });
    }

    const savedFile = await saveMessageFile({
      fileData: req.body?.fileData,
      fileName: req.body?.fileName,
      mimeType: req.body?.mimeType,
    });

    if (savedFile.error) {
      return res.status(400).json({ message: savedFile.error });
    }

    const [result] = await db.query(
      `
        INSERT INTO messages (
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size
        )
        VALUES (?, ?, '', ?, ?, ?, ?, ?)
      `,
      [
        conversationId,
        req.user.id,
        savedFile.messageType,
        savedFile.fileUrl,
        savedFile.originalName,
        savedFile.mimeType,
        savedFile.size,
      ]
    );

    await db.query("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      conversationId,
    ]);

    const [rows] = await db.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size,
          lu,
          created_at,
          updated_at,
          deleted_at
        FROM messages
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      message: "Message envoyé avec succès.",
      data: rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

async function getGroupMessages(req, res) {
  try {
    const group = await getOrCreateGeneralGroup();

    if (!group) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          group_id,
          sender_user_id,
          contenu,
          'text' AS message_type,
          NULL AS file_url,
          NULL AS file_name,
          NULL AS file_mime,
          NULL AS file_size,
          TRUE AS lu,
          created_at,
          updated_at,
          deleted_at
        FROM message_group_messages
        WHERE group_id = ?
        ORDER BY created_at ASC, id ASC
      `,
      [group.id]
    );

    return res.json({
      conversation: {
        id: group.id,
        is_group: true,
        nom_complet: group.titre || GENERAL_GROUP_TITLE,
      },
      messages: rows.map((row) => ({
        ...row,
        conversation_id: group.id,
        is_group_message: true,
      })),
      can_send: req.user?.role === "admin",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch messages",
    });
  }
}

async function sendGroupMessage(req, res) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Seul l'administrateur peut envoyer des messages dans ce groupe.",
      });
    }

    const contenu = String(req.body?.contenu || "").trim();

    if (!contenu) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (contenu.length > 2000) {
      return res.status(400).json({ message: "Message content is too long" });
    }

    const group = await getOrCreateGeneralGroup();

    if (!group) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const [result] = await db.query(
      `
        INSERT INTO message_group_messages (group_id, sender_user_id, contenu)
        VALUES (?, ?, ?)
      `,
      [group.id, req.user.id, contenu]
    );

    const [rows] = await db.query(
      `
        SELECT
          id,
          group_id,
          sender_user_id,
          contenu,
          'text' AS message_type,
          NULL AS file_url,
          NULL AS file_name,
          NULL AS file_mime,
          NULL AS file_size,
          TRUE AS lu,
          created_at,
          updated_at,
          deleted_at
        FROM message_group_messages
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    const message = rows[0]
      ? {
          ...rows[0],
          conversation_id: group.id,
          is_group_message: true,
        }
      : null;

    return res.status(201).json({
      message: "Message envoyé avec succès.",
      data: message,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

async function deleteGroupMessage(req, res) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const messageId = parsePositiveInt(req.params.messageId);

    if (!messageId) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const [existingRows] = await db.query(
      `
        SELECT id
        FROM message_group_messages
        WHERE id = ?
        LIMIT 1
      `,
      [messageId]
    );

    if (!existingRows[0]) {
      return res.status(404).json({ message: "Message not found" });
    }

    await db.query(
      `
        UPDATE message_group_messages
        SET contenu = '', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [messageId]
    );

    const [rows] = await db.query(
      `
        SELECT
          id,
          group_id,
          sender_user_id,
          contenu,
          'text' AS message_type,
          NULL AS file_url,
          NULL AS file_name,
          NULL AS file_mime,
          NULL AS file_size,
          TRUE AS lu,
          created_at,
          updated_at,
          deleted_at
        FROM message_group_messages
        WHERE id = ?
        LIMIT 1
      `,
      [messageId]
    );

    const message = rows[0]
      ? {
          ...rows[0],
          conversation_id: rows[0].group_id,
          is_group_message: true,
        }
      : null;

    return res.json({
      message: "Message supprimé.",
      data: message,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

function canMutateMessage(user, message) {
  if (!message) {
    return { ok: false, status: 404, message: "Message not found" };
  }

  if (!canAccessConversation(user, message)) {
    return { ok: false, status: 403, message: "Employees can only access their own messages" };
  }

  if (Number(message.sender_user_id) !== Number(user?.id)) {
    return { ok: false, status: 403, message: "Vous ne pouvez modifier que vos propres messages." };
  }

  if (message.deleted_at) {
    return { ok: false, status: 400, message: "Ce message est supprimé." };
  }

  const createdAt = new Date(message.created_at).getTime();

  if (!createdAt || Date.now() - createdAt > EDIT_DELETE_WINDOW_MS) {
    return { ok: false, status: 403, message: "Le délai de modification est dépassé." };
  }

  return { ok: true };
}

async function sendBroadcastMessage(req, res) {
  let connection;

  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const contenu = String(req.body?.contenu || "").trim();

    if (!contenu) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (contenu.length > 2000) {
      return res.status(400).json({ message: "Message content is too long" });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [employees] = await connection.query(
      `
        SELECT e.id
        FROM employes e
        JOIN utilisateurs u ON u.id = e.utilisateur_id
        WHERE e.utilisateur_id IS NOT NULL
        ORDER BY e.prenom ASC, e.nom ASC
      `
    );

    let firstMessage = null;

    for (const employee of employees) {
      const result = await getOrCreateConversationForEmploye(
        employee.id,
        req.user.id,
        connection
      );

      if (result.error || !result.conversation?.id) {
        continue;
      }

      const [insertResult] = await connection.query(
        `
          INSERT INTO messages (conversation_id, sender_user_id, contenu, message_type)
          VALUES (?, ?, ?, 'text')
        `,
        [result.conversation.id, req.user.id, contenu]
      );

      await connection.query(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [result.conversation.id]
      );

      if (!firstMessage) {
        const [rows] = await connection.query(
          `
            SELECT
              id,
              conversation_id,
              sender_user_id,
              contenu,
              message_type,
              file_url,
              file_name,
              file_mime,
              file_size,
              lu,
              created_at,
              updated_at,
              deleted_at
            FROM messages
            WHERE id = ?
            LIMIT 1
          `,
          [insertResult.insertId]
        );

        firstMessage = rows[0] || null;
      }
    }

    await connection.commit();

    return res.status(201).json({
      message: "Message envoyé avec succès.",
      data: firstMessage,
      recipients_count: employees.length,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function updateMessage(req, res) {
  try {
    const messageId = parsePositiveInt(req.params.messageId);
    const contenu = String(req.body?.contenu || "").trim();

    if (!messageId) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    if (!contenu) {
      return res.status(400).json({ message: "Message content is required" });
    }

    if (contenu.length > 2000) {
      return res.status(400).json({ message: "Message content is too long" });
    }

    const message = await findMessageById(messageId);
    const mutationCheck = canMutateMessage(req.user, message);

    if (!mutationCheck.ok) {
      return res.status(mutationCheck.status).json({ message: mutationCheck.message });
    }

    if (message.message_type !== "text") {
      return res.status(400).json({ message: "Seuls les messages texte peuvent être modifiés." });
    }

    await db.query(
      `
        UPDATE messages
        SET contenu = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [contenu, messageId]
    );

    const [rows] = await db.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size,
          lu,
          created_at,
          updated_at,
          deleted_at
        FROM messages
        WHERE id = ?
        LIMIT 1
      `,
      [messageId]
    );

    return res.json({
      message: "Message modifié avec succès.",
      data: rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

async function deleteMessage(req, res) {
  try {
    const messageId = parsePositiveInt(req.params.messageId);

    if (!messageId) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await findMessageById(messageId);
    const mutationCheck = canMutateMessage(req.user, message);

    if (!mutationCheck.ok) {
      return res.status(mutationCheck.status).json({ message: mutationCheck.message });
    }

    await db.query(
      `
        UPDATE messages
        SET
          contenu = '',
          file_url = NULL,
          file_name = NULL,
          file_mime = NULL,
          file_size = NULL,
          deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [messageId]
    );

    const [rows] = await db.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          contenu,
          message_type,
          file_url,
          file_name,
          file_mime,
          file_size,
          lu,
          created_at,
          updated_at,
          deleted_at
        FROM messages
        WHERE id = ?
        LIMIT 1
      `,
      [messageId]
    );

    return res.json({
      message: "Message supprimé.",
      data: rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to send message",
    });
  }
}

async function markConversationAsRead(req, res) {
  try {
    const conversationId = parsePositiveInt(req.params.conversationId);

    if (!conversationId) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await findConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!canAccessConversation(req.user, conversation)) {
      return res.status(403).json({ message: "Employees can only access their own messages" });
    }

    await db.query(
      `
        UPDATE messages
        SET lu = TRUE
        WHERE conversation_id = ? AND sender_user_id <> ?
      `,
      [conversationId, req.user.id]
    );

    return res.json({ message: "Conversation marquée comme lue." });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to mark conversation as read",
    });
  }
}

module.exports = {
  createConversation,
  deleteGroupMessage,
  deleteMessage,
  getGroupMessages,
  getMessages,
  getUnreadCount,
  listConversations,
  markConversationAsRead,
  sendAttachmentMessage,
  sendBroadcastMessage,
  sendGroupMessage,
  sendMessage,
  updateMessage,
};
