const express = require("express");

const {
  generateWeeklyPlanningController,
} = require("../controllers/planningGeneration.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin"));

router.post("/week", generateWeeklyPlanningController);

module.exports = router;
