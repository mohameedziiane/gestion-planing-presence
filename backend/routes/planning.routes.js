const express = require("express");

const {
  getAllPlanning,
  getPlanningByDate,
  getPlanningByEmploye,
  getPlanningById,
  createPlanning,
  updatePlanning,
  deletePlanning,
} = require("../controllers/planning.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  authorizeRoleAccess,
  authorizeRoles,
} = require("../middleware/role.middleware");

const router = express.Router();
const allowPlanningRead = authorizeRoleAccess("admin", "directeur", "employe");

router.use(verifyToken);

router.get("/", allowPlanningRead, getAllPlanning);
router.get("/date/:date", allowPlanningRead, getPlanningByDate);
router.get(
  "/employe/:employeId",
  authorizeRoles("admin", "directeur", "employe"),
  getPlanningByEmploye
);
router.get("/:id", allowPlanningRead, getPlanningById);
router.post("/", authorizeRoles("admin"), createPlanning);
router.put("/:id", authorizeRoles("admin"), updatePlanning);
router.delete("/:id", authorizeRoles("admin"), deletePlanning);

module.exports = router;
