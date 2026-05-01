const express = require("express");

const {
  saveDeviceToken,
  removeDeviceToken,
  testSendNotification,
} = require("../controllers/deviceTokens.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);

router.post("/", saveDeviceToken);
router.delete("/", removeDeviceToken);
router.post("/test-send", authorizeRoles("admin"), testSendNotification);

module.exports = router;
