const express = require("express");

const {
  exportPlanningPdf,
  exportPresencePdf,
} = require("../controllers/export.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur"));

router.get("/planning", exportPlanningPdf);
router.get("/presence", exportPresencePdf);

module.exports = router;
