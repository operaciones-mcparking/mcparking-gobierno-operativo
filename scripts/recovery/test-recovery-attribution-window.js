const assert = require("node:assert/strict");

function matchesAttributionWindow({ cartFormDatetime, intendedArrivalAt, purchaseCreatedAt }) {
  const cartDate = new Date(cartFormDatetime);
  const purchaseDate = new Date(purchaseCreatedAt);

  if (Number.isNaN(cartDate.getTime()) || Number.isNaN(purchaseDate.getTime())) return false;
  if (purchaseDate < cartDate) return false;

  const intendedArrivalDate = intendedArrivalAt ? new Date(intendedArrivalAt) : null;

  if (intendedArrivalDate && !Number.isNaN(intendedArrivalDate.getTime())) {
    return purchaseDate <= intendedArrivalDate;
  }

  const recoveryWindowEnd = new Date(cartDate);
  recoveryWindowEnd.setUTCDate(recoveryWindowEnd.getUTCDate() + 7);
  return purchaseDate < recoveryWindowEnd;
}

const cases = [
  {
    expected: false,
    name: "rejects purchases after intended arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "2026-07-16T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-17T10:00:00.000Z",
    }),
  },
  {
    expected: true,
    name: "accepts purchases after cart and before intended arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "2026-07-16T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-15T11:00:00.000Z",
    }),
  },
  {
    expected: false,
    name: "keeps old expired cart unmatched when purchase is after its arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "2026-07-16T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-23T11:00:00.000Z",
    }),
  },
  {
    expected: true,
    name: "matches new cart when purchase is before its arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-23T10:00:00.000Z",
      intendedArrivalAt: "2026-07-24T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-23T11:00:00.000Z",
    }),
  },
  {
    expected: true,
    name: "falls back to seven-day window when intended arrival is missing",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: null,
      purchaseCreatedAt: "2026-07-20T10:00:00.000Z",
    }),
  },
  {
    expected: true,
    name: "accepts purchase exactly at intended arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "2026-07-16T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-16T12:00:00.000Z",
    }),
  },
  {
    expected: false,
    name: "rejects purchase one millisecond after intended arrival",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "2026-07-16T12:00:00.000Z",
      purchaseCreatedAt: "2026-07-16T12:00:00.001Z",
    }),
  },
  {
    expected: true,
    name: "falls back to seven-day window when intended arrival is invalid",
    value: matchesAttributionWindow({
      cartFormDatetime: "2026-07-15T10:00:00.000Z",
      intendedArrivalAt: "invalid-date",
      purchaseCreatedAt: "2026-07-20T10:00:00.000Z",
    }),
  },
];

for (const testCase of cases) {
  assert.equal(testCase.value, testCase.expected, testCase.name);
}

console.log(`OK ${cases.length} recovery attribution window cases`);
