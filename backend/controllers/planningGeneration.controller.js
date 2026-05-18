const {
  PlanningGenerationError,
  generateWeeklyPlanning,
} = require("../services/planningGeneration.service");
const { createNotificationsForEmployeeIds } = require("../services/inAppNotification.service");

async function generateWeeklyPlanningController(req, res) {
  try {
    const result = await generateWeeklyPlanning(req.body);
    const employeIds = Array.isArray(result.planning)
      ? result.planning.map((row) => row.employe_id)
      : [];

    try {
      await createNotificationsForEmployeeIds(employeIds, {
        type: "planning_genere",
        titre: "Planning généré",
        message: `Votre planning de la semaine du ${result.week.startDate} au ${result.week.endDate} est disponible.`,
      });
    } catch (notificationError) {
      console.error("Failed to create planning generation notifications:", notificationError.message);
    }

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
