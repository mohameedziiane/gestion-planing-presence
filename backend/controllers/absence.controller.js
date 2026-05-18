const {
  AbsenceServiceError,
  detectAbsences,
  getAbsencesByDate,
} = require("../services/absence.service");
const { createNotificationsForAdmins } = require("../services/inAppNotification.service");

async function detectAbsencesController(req, res) {
  try {
    const result = await detectAbsences(req.body.date);

    if (result.createdCount > 0) {
      try {
        await createNotificationsForAdmins({
          type: "absence_employe",
          titre: "Employ\u00e9 marqu\u00e9 absent",
          message: `${result.createdCount} absence(s) d\u00e9tect\u00e9e(s) le ${result.date}.`,
        });
      } catch (notificationError) {
        console.error("Failed to create absence notification:", notificationError.message);
      }
    }

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
