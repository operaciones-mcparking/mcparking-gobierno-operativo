const RECOVERY_TIME_ZONE = "America/Santiago";

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

function timeZoneParts(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = timeZoneParts(timeZone, date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtcDate(timeZone, year, month, day, hour, minute, second) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, guess));
  const secondPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, firstPass));
  const localParts = timeZoneParts(timeZone, secondPass);

  if (
    localParts.year !== year ||
    localParts.month !== month ||
    localParts.day !== day ||
    localParts.hour !== hour ||
    localParts.minute !== minute ||
    localParts.second !== second
  ) {
    return null;
  }

  return secondPass;
}

function hasExplicitTimeZone(value) {
  return /[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function integerPart(value) {
  return Number.parseInt(value, 10);
}

function parseDateSafe(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  if (!value) return null;

  if (hasExplicitTimeZone(value)) {
    const direct = new Date(value);

    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const dayFirstMatch = value.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  const isoLocalMatch = value.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!dayFirstMatch && !isoLocalMatch) return null;

  const [, first, secondValue, third, hour = "0", minute = "0", seconds = "0"] =
    dayFirstMatch ?? isoLocalMatch;
  const year = integerPart(dayFirstMatch ? third : first);
  const month = integerPart(secondValue);
  const day = integerPart(dayFirstMatch ? first : third);
  const hourNumber = integerPart(hour);
  const minuteNumber = integerPart(minute);
  const secondNumber = integerPart(seconds);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hourNumber < 0 ||
    hourNumber > 23 ||
    minuteNumber < 0 ||
    minuteNumber > 59 ||
    secondNumber < 0 ||
    secondNumber > 59
  ) {
    return null;
  }

  return zonedDateTimeToUtcDate(
    RECOVERY_TIME_ZONE,
    year,
    month,
    day,
    hourNumber,
    minuteNumber,
    secondNumber,
  );
}

module.exports = {
  isValidPurchase,
  normalizeEmail,
  normalizePhone,
  normalizePrice,
  parseDateSafe,
};
