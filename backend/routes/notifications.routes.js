const express = require("express");

const {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} = require("../controllers/notifications.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoleAccess } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoleAccess("admin", "directeur", "employe"));

router.get("/", getNotifications);
router.patch("/read-all", markAllNotificationsAsRead);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
