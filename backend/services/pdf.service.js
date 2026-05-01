const PDFDocument = require("pdfkit");

function createPdfResponse(doc, res, filename) {
  return new Promise((resolve, reject) => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    doc.on("end", resolve);
    doc.on("error", reject);
    res.on("error", reject);

    doc.pipe(res);
  });
}

function drawHeader(doc, title, startDate, endDate) {
  doc
    .fontSize(18)
    .text(title, { align: "center" })
    .moveDown(0.5);

  doc
    .fontSize(11)
    .text(`Period: ${startDate} to ${endDate}`, { align: "center" })
    .moveDown(1);
}

function drawTableHeader(doc, columns, startX, rowY) {
  let currentX = startX;

  doc.font("Helvetica-Bold").fontSize(10);

  for (const column of columns) {
    doc.text(column.label, currentX, rowY, {
      width: column.width,
      align: column.align || "left",
    });
    currentX += column.width;
  }

  doc
    .moveTo(startX, rowY + 16)
    .lineTo(startX + columns.reduce((sum, column) => sum + column.width, 0), rowY + 16)
    .stroke();
}

function drawTableRows(doc, columns, rows, emptyMessage) {
  const startX = doc.page.margins.left;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;
  let rowY = doc.y;

  drawTableHeader(doc, columns, startX, rowY);
  rowY += 24;
  doc.font("Helvetica").fontSize(9);

  if (rows.length === 0) {
    doc.text(emptyMessage, startX, rowY);
    return;
  }

  for (const row of rows) {
    const values = columns.map((column) => String(row[column.key] ?? "-"));
    const rowHeight = Math.max(
      ...values.map((value, index) =>
        doc.heightOfString(value, {
          width: columns[index].width,
          align: columns[index].align || "left",
        })
      ),
      14
    ) + 6;

    if (rowY + rowHeight > bottomLimit) {
      doc.addPage();
      rowY = doc.page.margins.top;
      drawTableHeader(doc, columns, startX, rowY);
      rowY += 24;
      doc.font("Helvetica").fontSize(9);
    }

    let currentX = startX;

    values.forEach((value, index) => {
      doc.text(value, currentX, rowY, {
        width: columns[index].width,
        align: columns[index].align || "left",
      });
      currentX += columns[index].width;
    });

    rowY += rowHeight;
  }
}

async function streamPlanningPdf(res, rows, startDate, endDate) {
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    layout: "landscape",
  });

  const responseReady = createPdfResponse(doc, res, "planning-report.pdf");

  drawHeader(doc, "Planning Report", startDate, endDate);
  drawTableRows(
    doc,
    [
      { key: "full_name", label: "Employee", width: 170 },
      { key: "groupe", label: "Group", width: 100 },
      { key: "date", label: "Date", width: 90 },
      { key: "periode_travail", label: "Shift", width: 90 },
      { key: "role_travail", label: "Work Role", width: 130 },
    ],
    rows,
    "No planning rows found for the selected period."
  );

  doc.end();
  await responseReady;
}

async function streamPresencePdf(res, rows, startDate, endDate) {
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    layout: "landscape",
  });

  const responseReady = createPdfResponse(doc, res, "presence-report.pdf");

  drawHeader(doc, "Presence Report", startDate, endDate);
  drawTableRows(
    doc,
    [
      { key: "full_name", label: "Employee", width: 170 },
      { key: "date", label: "Date", width: 90 },
      { key: "statut", label: "Status", width: 90 },
      { key: "heure_arrivee", label: "Check-in Time", width: 100 },
      { key: "adresse_ip", label: "IP Address", width: 170 },
    ],
    rows,
    "No presence rows found for the selected period."
  );

  doc.end();
  await responseReady;
}

module.exports = {
  streamPlanningPdf,
  streamPresencePdf,
};
