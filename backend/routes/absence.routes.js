const express = require("express");

const {
  detectAbsencesController,
  getAbsencesByDateController,
} = require("../controllers/absence.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);

router.post("/detect", authorizeRoles("admin"), detectAbsencesController);
router.get(
  "/date/:date",
  authorizeRoles("admin", "directeur"),
  getAbsencesByDateController
);

module.exports = router;
