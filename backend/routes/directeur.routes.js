const express = require("express");

const { getDashboard } = require("../controllers/directeur.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur"));

router.get("/dashboard", getDashboard);

module.exports = router;
