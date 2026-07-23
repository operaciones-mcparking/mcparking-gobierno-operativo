const assert = require("node:assert/strict");

const statusRank = {
  read: 4,
  delivered: 3,
  failed: 2,
  sent: 1,
  unknown: 0,
};

function canUpdate({ existingStatus, existingUpdatedAt, incomingStatus, incomingUpdatedAt, rowHashChanged = true }) {
  if (!rowHashChanged) return false;

  const existingTime = existingUpdatedAt ? new Date(existingUpdatedAt) : null;
  const incomingTime = incomingUpdatedAt ? new Date(incomingUpdatedAt) : null;
  const existingValidTime = existingTime && !Number.isNaN(existingTime.getTime());
  const incomingValidTime = incomingTime && !Number.isNaN(incomingTime.getTime());

  const timestampAllowsUpdate =
    (existingValidTime && incomingValidTime && incomingTime >= existingTime) ||
    (!existingValidTime && incomingValidTime) ||
    (!existingValidTime && !incomingValidTime);

  const statusAllowsUpdate = (statusRank[incomingStatus] ?? 0) >= (statusRank[existingStatus] ?? 0);

  return timestampAllowsUpdate && statusAllowsUpdate;
}

function classifyRow(row) {
  if (row.invalid) return "invalid";
  if (row.conflict) return "conflict";
  if (row.existingMessageId) {
    return canUpdate(row) ? "updated" : "skipped";
  }
  if (row.existingSourceId || row.existingHashId) return "skipped";
  return "inserted";
}

function summarize(rows) {
  const summary = {
    conflictRows: 0,
    insertedRows: 0,
    invalidRows: 0,
    skippedDuplicateRows: 0,
    updatedRows: 0,
  };

  for (const row of rows) {
    const category = classifyRow(row);
    if (category === "conflict") summary.conflictRows += 1;
    if (category === "inserted") summary.insertedRows += 1;
    if (category === "invalid") summary.invalidRows += 1;
    if (category === "skipped") summary.skippedDuplicateRows += 1;
    if (category === "updated") summary.updatedRows += 1;
  }

  return summary;
}

function assertInvariant(summary, rowsTotal) {
  assert.equal(
    summary.insertedRows + summary.updatedRows + summary.skippedDuplicateRows + summary.conflictRows + summary.invalidRows,
    rowsTotal,
  );
}

const caseA = summarize([
  ...Array.from({ length: 30 }, () => ({})),
  ...Array.from({ length: 6 }, () => ({
    existingMessageId: true,
    existingStatus: "sent",
    existingUpdatedAt: "2026-07-23T12:00:00.000Z",
    incomingStatus: "delivered",
    incomingUpdatedAt: "2026-07-23T13:00:00.000Z",
  })),
  ...Array.from({ length: 4964 }, () => ({
    existingHashId: true,
    existingMessageId: true,
    existingStatus: "read",
    existingUpdatedAt: "2026-07-23T13:00:00.000Z",
    incomingStatus: "sent",
    incomingUpdatedAt: "2026-07-23T12:00:00.000Z",
    rowHashChanged: true,
  })),
]);
assert.deepEqual(caseA, {
  conflictRows: 0,
  insertedRows: 30,
  invalidRows: 0,
  skippedDuplicateRows: 4964,
  updatedRows: 6,
});
assertInvariant(caseA, 5000);

const caseB = summarize([{ existingHashId: true, existingMessageId: true, rowHashChanged: false }]);
assert.equal(caseB.skippedDuplicateRows, 1);
assertInvariant(caseB, 1);

const caseC = summarize([{
  existingMessageId: true,
  existingStatus: "sent",
  existingUpdatedAt: "2026-07-23T13:00:00.000Z",
  incomingStatus: "delivered",
  incomingUpdatedAt: "2026-07-23T12:00:00.000Z",
}]);
assert.equal(caseC.skippedDuplicateRows, 1);
assert.equal(caseC.updatedRows, 0);
assertInvariant(caseC, 1);

const caseD = summarize([{
  existingMessageId: true,
  existingStatus: "read",
  existingUpdatedAt: "2026-07-23T12:00:00.000Z",
  incomingStatus: "sent",
  incomingUpdatedAt: "2026-07-23T13:00:00.000Z",
}]);
assert.equal(caseD.skippedDuplicateRows, 1);
assert.equal(caseD.updatedRows, 0);
assertInvariant(caseD, 1);

const caseE = summarize([{
  existingMessageId: true,
  existingStatus: "sent",
  existingUpdatedAt: "2026-07-23T12:00:00.000Z",
  incomingStatus: "read",
  incomingUpdatedAt: "2026-07-23T13:00:00.000Z",
}]);
assert.equal(caseE.updatedRows, 1);
assert.equal(caseE.skippedDuplicateRows, 0);
assertInvariant(caseE, 1);

const caseF = summarize([{}]);
assert.equal(caseF.insertedRows, 1);
assert.equal(caseF.skippedDuplicateRows, 0);
assertInvariant(caseF, 1);

console.log("OK whatsapp tracking duplicate count cases A-F");
