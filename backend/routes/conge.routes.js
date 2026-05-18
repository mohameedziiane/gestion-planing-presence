const express = require("express");

const {
  acceptDemande,
  createMedicalDeduction,
  createMyDemande,
  getAdminDemandes,
  getMedicalDeductions,
  getMyDemandes,
  getMySummary,
  refuseDemande,
} = require("../controllers/conge.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);

router.get("/me/summary", getMySummary);
router.get("/me/demandes", getMyDemandes);
router.post("/me/demandes", createMyDemande);

router.get(
  "/admin/demandes",
  authorizeRoles("admin", "directeur"),
  getAdminDemandes
);
router.get(
  "/admin/medical-deductions",
  authorizeRoles("admin", "directeur"),
  getMedicalDeductions
);
router.post(
  "/admin/medical-deductions",
  authorizeRoles("admin"),
  createMedicalDeduction
);
router.post(
  "/admin/demandes/:id/accept",
  authorizeRoles("admin"),
  acceptDemande
);
router.post(
  "/admin/demandes/:id/refuse",
  authorizeRoles("admin"),
  refuseDemande
);

module.exports = router;
