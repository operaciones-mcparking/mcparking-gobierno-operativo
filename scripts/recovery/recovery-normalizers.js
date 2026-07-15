function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;

  let digits = String(raw).replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("056")) digits = digits.slice(1);
  if (digits.length === 8) return `569${digits}`;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  if (digits.length === 10 && digits.startsWith("09")) return `56${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("56")) return digits;

  return null;
}

function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;

  const email = String(raw).trim().toLowerCase();

  if (!email) return null;

  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const cleaned = String(raw)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!cleaned) return null;

  let normalized;

  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function isValidPurchase(bookingStatus) {
  const status = Number(bookingStatus);

  return status === 1 || status === 8;
}

function parseDateSafe(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  if (!value) return null;

  const direct = new Date(value);

  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) return null;

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  isValidPurchase,
  normalizeEmail,
  normalizePhone,
  normalizePrice,
  parseDateSafe,
};
