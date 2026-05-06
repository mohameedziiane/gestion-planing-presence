const express = require("express");

const {
  getAllPresence,
  getPresenceByDate,
  getPresenceByEmploye,
  getPresenceById,
  pointerPresence,
  syncAbsences,
  createPresence,
  updatePresence,
  deletePresence,
} = require("../controllers/presence.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  authorizeEmployeeOnly,
  authorizeRoleAccess,
  authorizeRoles,
} = require("../middleware/role.middleware");

const router = express.Router();
const allowPresenceRead = authorizeRoleAccess("admin", "directeur", "employe");

router.use(verifyToken);

router.get("/", allowPresenceRead, getAllPresence);
router.get("/date/:date", allowPresenceRead, getPresenceByDate);
router.get(
  "/employe/:employeId",
  authorizeRoles("admin", "directeur", "employe"),
  getPresenceByEmploye
);
router.post("/pointer", authorizeEmployeeOnly, pointerPresence);
router.post("/sync-absences", authorizeRoles("admin"), syncAbsences);
router.get("/:id", allowPresenceRead, getPresenceById);
router.post("/", authorizeRoles("admin"), createPresence);
router.put("/:id", authorizeRoles("admin"), updatePresence);
router.delete("/:id", authorizeRoles("admin"), deletePresence);

module.exports = router;
