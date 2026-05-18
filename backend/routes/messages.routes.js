const express = require("express");

const {
  createConversation,
  getMessages,
  getUnreadCount,
  listConversations,
  markConversationAsRead,
  sendMessage,
} = require("../controllers/messages.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoleAccess } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoleAccess("admin", "employe"));

router.get("/unread-count", getUnreadCount);
router.get("/conversations", listConversations);
router.post("/conversations", createConversation);
router.get("/conversations/:conversationId/messages", getMessages);
router.post("/conversations/:conversationId/messages", sendMessage);
router.patch("/conversations/:conversationId/read", markConversationAsRead);

module.exports = router;
