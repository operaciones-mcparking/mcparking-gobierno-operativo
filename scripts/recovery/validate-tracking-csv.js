const fs = require("node:fs");
const path = require("node:path");

const { validateTrackingCsv } = require("./tracking-csv-validator");

function printReport(filePath, report) {
  console.log("Recovery WhatsApp tracking CSV validation");
  console.log(`File: ${path.basename(filePath)}`);
  console.log("");
  console.log("Structure");
  console.table([
    { metric: "Rows", value: report.rows },
    { metric: "Columns", value: report.columns },
    { metric: "Delimiter", value: report.delimiter },
    { metric: "Missing mandatory columns", value: report.missingMandatory.join(", ") || "none" },
    { metric: "Missing recommended columns", value: report.missingRecommended.join(", ") || "none" },
    { metric: "Missing expected columns", value: report.missingExpected.join(", ") || "none" },
    { metric: "Extra columns", value: report.extraColumns.length },
  ]);

  console.log("Message matching quality");
  console.table([
    { metric: "Message IDs present", value: `${report.messageIdPresent} / ${report.rows}` },
    { metric: "Rows without message id", value: report.rowsWithoutMessageId },
    {
      metric: "Rows without message id and client phone",
      value: report.rowsWithoutMessageIdAndClientPhone,
    },
    { metric: "Client phones present", value: `${report.clientPhonePresent} / ${report.rows}` },
    { metric: "Client phones normalizable", value: `${report.clientPhoneNormalizable} / ${report.rows}` },
    { metric: "Business phones present", value: `${report.businessPhonePresent} / ${report.rows}` },
    { metric: "Business phones normalizable", value: `${report.businessPhoneNormalizable} / ${report.rows}` },
  ]);

  console.log("Tracking dates");
  console.table([
    { metric: "Fecha_Sent parseable", value: `${report.sentAtParseable} / ${report.rows}` },
    { metric: "Fecha_Delivered parseable", value: `${report.deliveredAtParseable} / ${report.rows}` },
    { metric: "Fecha_Read parseable", value: `${report.readAtParseable} / ${report.rows}` },
    { metric: "Fecha_Failed parseable", value: `${report.failedAtParseable} / ${report.rows}` },
    { metric: "createdAt parseable", value: `${report.parseableCreatedAt} / ${report.rows}` },
    { metric: "updatedAt parseable", value: `${report.parseableUpdatedAt} / ${report.rows}` },
  ]);

  console.log("Tracking status");
  console.table(report.statusCounts);

  console.log("Tracking inconsistencies");
  console.table([
    { metric: "Failed + read", value: report.failedAndReadRows },
    { metric: "Failed + delivered", value: report.failedAndDeliveredRows },
    { metric: "Failed + sent", value: report.failedAndSentRows },
    {
      metric: "Rows without tracking dates",
      value: report.statusCounts.find((item) => item.value === "unknown")?.count ?? 0,
    },
  ]);

  console.log("Categories");
  console.table(report.categoryCounts);

  console.log("Charge types");
  console.table(report.chargeTypeCounts);

  console.log("Duplicates and survey payload");
  console.table([
    { metric: "Duplicate id groups", value: report.duplicateIdGroups },
    { metric: "Duplicate Id_Mensaje groups", value: report.duplicateMessageIdGroups },
    { metric: "Json_Encuesta present", value: `${report.surveyJsonPresent} / ${report.rows}` },
    { metric: "Json_Encuesta parseable", value: `${report.surveyJsonParseable} / ${report.rows}` },
  ]);

  if (report.extraColumns.length > 0) {
    console.log("Extra columns for raw_payload review");
    console.log(report.extraColumns.join(", "));
  }
}

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node scripts/recovery/validate-tracking-csv.js "C:\\ruta\\Seguimiento.csv"');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const report = validateTrackingCsv(content);
  printReport(filePath, report);
}

if (require.main === module) {
  main();
}

module.exports = {
  printReport,
};
