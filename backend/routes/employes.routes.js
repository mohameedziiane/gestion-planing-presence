const express = require("express");

const {
  getAllEmployes,
  getEmployeById,
  createEmploye,
  updateEmploye,
  deleteEmploye,
} = require("../controllers/employes.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);

router.get("/", authorizeRoles("admin", "directeur", "employe"), getAllEmployes);
router.get(
  "/:id",
  authorizeRoles("admin", "directeur", "employe"),
  getEmployeById
);
router.post("/", authorizeRoles("admin"), createEmploye);
router.put("/:id", authorizeRoles("admin"), updateEmploye);
router.delete("/:id", authorizeRoles("admin"), deleteEmploye);

module.exports = router;
