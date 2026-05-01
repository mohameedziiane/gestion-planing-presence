const express = require("express");

const {
  getAllRepos,
  getReposByDate,
  getReposByEmploye,
  getReposById,
  createRepos,
  updateRepos,
  deleteRepos,
} = require("../controllers/repos.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  authorizeRoleAccess,
  authorizeRoles,
} = require("../middleware/role.middleware");

const router = express.Router();
const allowReposRead = authorizeRoleAccess("admin", "directeur", "employe");

router.use(verifyToken);

router.get("/", allowReposRead, getAllRepos);
router.get("/date/:date", allowReposRead, getReposByDate);
router.get(
  "/employe/:employeId",
  authorizeRoles("admin", "directeur", "employe"),
  getReposByEmploye
);
router.get("/:id", allowReposRead, getReposById);
router.post("/", authorizeRoles("admin"), createRepos);
router.put("/:id", authorizeRoles("admin"), updateRepos);
router.delete("/:id", authorizeRoles("admin"), deleteRepos);

module.exports = router;
