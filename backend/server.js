require("dotenv").config({ quiet: true });

const cors = require("cors");
const express = require("express");

const db = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const employesRoutes = require("./routes/employes.routes");
const planningRoutes = require("./routes/planning.routes");
const planningGenerationRoutes = require("./routes/planningGeneration.routes");
const absenceRoutes = require("./routes/absence.routes");
const presenceRoutes = require("./routes/presence.routes");
const referenceRoutes = require("./routes/reference.routes");
const reposRoutes = require("./routes/repos.routes");
const deviceTokensRoutes = require("./routes/deviceTokens.routes");
const exportRoutes = require("./routes/export.routes");
const statsRoutes = require("./routes/stats.routes");
const validationRoutes = require("./routes/validation.routes");

const app = express();
const port = process.env.PORT || 5000;
const requiredEnvVars = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  process.exit(1);
}

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running" });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");

    res.json({
      message: "Database connection successful",
      result: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/employes", employesRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/planning-generation", planningGenerationRoutes);
app.use("/api/absence", absenceRoutes);
app.use("/api/presence", presenceRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/repos", reposRoutes);
app.use("/api/device-tokens", deviceTokensRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/validation", validationRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON body",
    });
  }

  console.error(error);

  res.status(500).json({
    message: "Internal server error",
  });
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = { app, server };
