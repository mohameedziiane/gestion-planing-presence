const { buildPlanningExcelExport } = require("../services/export.service");

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

function getDateRange(query) {
  const startDate = String(query.startDate || "").trim();
  const endDate = String(query.endDate || "").trim();

  if (!startDate || !endDate) {
    return {
      error: "startDate and endDate are required",
    };
  }

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return {
      error: "startDate and endDate must be valid dates in YYYY-MM-DD format",
    };
  }

  if (startDate > endDate) {
    return {
      error: "startDate must be before or equal to endDate",
    };
  }

  return {
    value: { startDate, endDate },
  };
}

async function exportPlanningExcel(req, res) {
  try {
    const { error, value } = getDateRange(req.query);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const { buffer, filename } = await buildPlanningExcelExport(
      value.startDate,
      value.endDate
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.send(buffer);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to export planning Excel",
      });
    }
  }
}

module.exports = {
  exportPlanningExcel,
};
