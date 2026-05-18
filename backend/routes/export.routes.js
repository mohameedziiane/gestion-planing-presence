const express = require("express");

const {
  exportPlanningExcel,
} = require("../controllers/export.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur"));

router.get("/planning/excel", authorizeRoles("admin"), exportPlanningExcel);

module.exports = router;
