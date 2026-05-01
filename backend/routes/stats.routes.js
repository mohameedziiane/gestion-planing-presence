const express = require("express");

const {
  getOverview,
  getPresenceStats,
  getReposStats,
  getPlanningStats,
  getDailyStats,
} = require("../controllers/stats.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin", "directeur"));

router.get("/overview", getOverview);
router.get("/presence", getPresenceStats);
router.get("/repos", getReposStats);
router.get("/planning", getPlanningStats);
router.get("/date/:date", getDailyStats);

module.exports = router;
