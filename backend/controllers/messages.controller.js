const db = require("../config/db");
const { createNotificationsForAdmins } = require("../services/inAppNotification.service");

function parsePositiveInt(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function isAdmin(user) {
  return user?.role === "admin";
}

function isEmploye(user) {
  return user?.role === "employe";
}

function formatEmployeName(row) {
  return [row.prenom, row.nom].filter(Boolean).join(" ").trim();
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

function canAccessConversation(user, conversation) {
  if (!user || !conversation) {
    return false;
  }

  if (isAdmin(user)) {
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
    if (isAdmin(req.user)) {
      const [rows] = await db.query(
        `
          SELECT
            e.id AS employe_id,
            e.prenom,
            e.nom,
            e.utilisateur_id,
            c.id AS conversation_id,
            last_message.contenu AS last_message,
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
            WHERE lu = FALSE AND sender_user_id IN (
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

      return res.json(
        rows.map((row) => ({
          conversation_id: row.conversation_id,
          employe_id: row.employe_id,
          nom_complet: formatEmployeName(row),
          prenom: row.prenom,
          nom: row.nom,
          last_message: row.last_message || "",
          last_message_at: row.last_message_at,
          unread_count: Number(row.unread_count || 0),
        }))
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

      return res.json([
        {
          conversation_id: result.conversation.id,
          employe_id: result.conversation.employe_id,
          nom_complet: "Admin",
        },
      ]);
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
    if (isAdmin(req.user)) {
      const [rows] = await db.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          JOIN employes e ON e.id = c.employe_id
          WHERE m.lu = FALSE
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
    if (isAdmin(req.user)) {
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
          lu,
          created_at
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
        nom_complet: isAdmin(req.user) ? formatEmployeName(conversation) : "Admin",
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
        INSERT INTO messages (conversation_id, sender_user_id, contenu)
        VALUES (?, ?, ?)
      `,
      [conversationId, req.user.id, contenu]
    );

    await db.query("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      conversationId,
    ]);

    const [rows] = await db.query(
      `
        SELECT id, conversation_id, sender_user_id, contenu, lu, created_at
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
  getMessages,
  getUnreadCount,
  listConversations,
  markConversationAsRead,
  sendMessage,
};
