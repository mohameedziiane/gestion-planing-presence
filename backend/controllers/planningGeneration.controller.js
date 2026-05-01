const {
  PlanningGenerationError,
  generateWeeklyPlanning,
} = require("../services/planningGeneration.service");

async function generateWeeklyPlanningController(req, res) {
  try {
    const result = await generateWeeklyPlanning(req.body);

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof PlanningGenerationError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to generate weekly planning",
    });
  }
}

module.exports = {
  generateWeeklyPlanningController,
};
