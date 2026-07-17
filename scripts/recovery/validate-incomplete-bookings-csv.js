const fs = require("node:fs");
const path = require("node:path");

const { validateIncompleteBookingsCsv } = require("./incomplete-bookings-csv-validator");

function formatDate(date) {
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function printReport(filePath, report) {
  console.log("Recovery incomplete bookings CSV validation");
  console.log(`File: ${path.basename(filePath)}`);
  console.log("");
  console.log("Structure");
  console.table([
    { metric: "Rows", value: report.rows },
    { metric: "Columns", value: report.columns },
    { metric: "Delimiter", value: report.delimiter },
    { metric: "Missing mandatory columns", value: report.missingMandatory.join(", ") || "none" },
    { metric: "Missing expected columns", value: report.missingExpected.join(", ") || "none" },
    { metric: "Extra columns", value: report.extraColumns.length },
  ]);

  console.log("Matching quality");
  console.table([
    { metric: "Emails present", value: `${report.emailPresent} / ${report.rows}` },
    { metric: "Emails valid", value: `${report.emailValid} / ${report.rows}` },
    { metric: "Phones present", value: `${report.phonePresent} / ${report.rows}` },
    { metric: "Phones normalizable", value: `${report.phoneNormalizable} / ${report.rows}` },
    { metric: "Rows without email and phone", value: report.missingEmailAndPhone },
  ]);

  console.log("Types");
  console.table([
    { metric: "Valid type rows", value: `${report.validTypeRows} / ${report.rows}` },
    { metric: "Unknown type rows", value: report.unknownTypeRows },
  ]);
  console.table(report.typeCounts);

  if (report.unknownTypeCounts.length > 0) {
    console.log("Unknown type counts");
    console.table(report.unknownTypeCounts);
  }

  console.log("Messages");
  console.table([
    { metric: "Message IDs present", value: `${report.messageIdPresent} / ${report.rows}` },
    { metric: "Message_Sent true", value: report.messageSentTrue },
    { metric: "Message_Sent false", value: report.messageSentFalse },
    { metric: "Message_Sent parseable", value: `${report.messageSentParseable} / ${report.rows}` },
  ]);

  console.log("Dates and duplicates");
  console.table([
    { metric: "Parseable form_datetime", value: `${report.parseableFormDatetime} / ${report.rows}` },
    { metric: "Min form_datetime", value: formatDate(report.minFormDatetime) },
    { metric: "Max form_datetime", value: formatDate(report.maxFormDatetime) },
    { metric: "Parseable createdAt", value: `${report.parseableCreatedAt} / ${report.rows}` },
    { metric: "Parseable updatedAt", value: `${report.parseableUpdatedAt} / ${report.rows}` },
    { metric: "Duplicate id groups", value: report.duplicateIdGroups },
    { metric: "Duplicate booking_id groups", value: report.duplicateBookingIdGroups },
    { metric: "Duplicate Id_Mensaje groups", value: report.duplicateMessageIdGroups },
  ]);

  console.log("Operational context");
  console.table([
    { metric: "Parking codes present", value: `${report.parkingCodePresent} / ${report.rows}` },
  ]);

  if (report.extraColumns.length > 0) {
    console.log("Extra columns for raw_payload review");
    console.log(report.extraColumns.join(", "));
  }
}

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error(
      'Usage: node scripts/recovery/validate-incomplete-bookings-csv.js "C:\\ruta\\BackendIncompleteBookings2.csv"',
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const report = validateIncompleteBookingsCsv(content);
  printReport(filePath, report);
}

if (require.main === module) {
  main();
}

module.exports = {
  printReport,
};
