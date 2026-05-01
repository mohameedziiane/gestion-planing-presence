const {
  ValidationServiceError,
  validatePlanningPeriod,
} = require("../services/validation.service");

async function validatePlanning(req, res) {
  try {
    const result = await validatePlanningPeriod(req.query);

    return res.json(result);
  } catch (error) {
    if (error instanceof ValidationServiceError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to validate planning",
    });
  }
}

module.exports = {
  validatePlanning,
};
