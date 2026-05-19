const express = require("express");

const {
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
} = require("../controllers/messages.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken);
router.use((req, res, next) => {
  if (["admin", "directeur", "employe"].includes(req.user?.role)) {
    return next();
  }

  return res.status(403).json({ message: "Access denied" });
});

router.get("/unread-count", getUnreadCount);
router.get("/conversations", listConversations);
router.post("/conversations", createConversation);
router.get("/group/messages", getGroupMessages);
router.post("/group/messages", sendGroupMessage);
router.delete("/group/messages/:messageId", deleteGroupMessage);
router.post("/broadcast", sendBroadcastMessage);
router.get("/conversations/:conversationId/messages", getMessages);
router.post("/conversations/:conversationId/messages", sendMessage);
router.post("/conversations/:conversationId/attachments", sendAttachmentMessage);
router.patch("/conversations/:conversationId/read", markConversationAsRead);
router.patch("/messages/:messageId", updateMessage);
router.delete("/messages/:messageId", deleteMessage);

module.exports = router;
