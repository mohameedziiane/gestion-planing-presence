const express = require("express");

const { validatePlanning } = require("../controllers/validation.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur"));

router.get("/planning", validatePlanning);

module.exports = router;
