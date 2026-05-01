const {
  AbsenceServiceError,
  detectAbsences,
  getAbsencesByDate,
} = require("../services/absence.service");

async function detectAbsencesController(req, res) {
  try {
    const result = await detectAbsences(req.body.date);

    return res.json(result);
  } catch (error) {
    if (error instanceof AbsenceServiceError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to detect absences",
    });
  }
}

async function getAbsencesByDateController(req, res) {
  try {
    const result = await getAbsencesByDate(req.params.date);

    return res.json(result);
  } catch (error) {
    if (error instanceof AbsenceServiceError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch absences",
    });
  }
}

module.exports = {
  detectAbsencesController,
  getAbsencesByDateController,
};
