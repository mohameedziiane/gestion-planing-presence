const express = require("express");

const { login, me } = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", login);
router.get("/me", verifyToken, me);

module.exports = router;
