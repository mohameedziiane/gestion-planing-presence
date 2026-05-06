const express = require("express");

const {
  createMyCertificat,
  getAdminCertificats,
  getMyCertificats,
  refuseCertificat,
  validateCertificat,
} = require("../controllers/certificat.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  authorizeEmployeeOnly,
  authorizeRoles,
} = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);

router.get("/me", authorizeEmployeeOnly, getMyCertificats);
router.post("/me", authorizeEmployeeOnly, createMyCertificat);

router.get("/admin", authorizeRoles("admin"), getAdminCertificats);
router.post(
  "/admin/:id/validate",
  authorizeRoles("admin"),
  validateCertificat
);
router.post(
  "/admin/:id/refuse",
  authorizeRoles("admin"),
  refuseCertificat
);

module.exports = router;
