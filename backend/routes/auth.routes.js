const express = require("express");

const {
  changePassword,
  getMyAvatar,
  login,
  me,
  updateAvatar,
} = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", login);
router.get("/me", verifyToken, me);
router.get("/avatar", verifyToken, getMyAvatar);
router.patch("/change-password", verifyToken, changePassword);
router.patch("/avatar", verifyToken, updateAvatar);

module.exports = router;
