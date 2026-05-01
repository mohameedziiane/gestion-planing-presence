const express = require("express");

const {
  getRoles,
  getGroupes,
  getPeriodesTravail,
  getRolesTravail,
  getAllReferenceData,
} = require("../controllers/reference.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur", "employe"));

router.get("/roles", getRoles);
router.get("/groupes", getGroupes);
router.get("/periodes-travail", getPeriodesTravail);
router.get("/roles-travail", getRolesTravail);
router.get("/all", getAllReferenceData);

module.exports = router;
