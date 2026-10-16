export const RECOVERY_CHAT_TIME_ZONE = "America/Santiago";

type DateParts = {
  day: string;
  month: string;
  year: string;
};

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: RECOVERY_CHAT_TIME_ZONE,
  year: "numeric",
});

function dateParts(value: string | Date): DateParts | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    datePartsFormatter
      .formatToParts(date)
      .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
      .map((part) => [part.type, part.value]),
  );

  if (!parts.day || !parts.month || !parts.year) return null;

  return parts as DateParts;
}

export function recoveryChatDateKey(value: string | null | undefined) {
  if (!value) return null;

  const parts = dateParts(value);

  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function formatRecoveryChatDateSeparator(
  value: string | null | undefined,
  now: Date = new Date(),
) {
  const messageParts = value ? dateParts(value) : null;
  const todayParts = dateParts(now);

  if (!messageParts || !todayParts) return null;

  const messageKey = `${messageParts.year}-${messageParts.month}-${messageParts.day}`;
  const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

  if (messageKey === todayKey) return "Hoy";

  const yesterdayUtc = new Date(Date.UTC(
    Number(todayParts.year),
    Number(todayParts.month) - 1,
    Number(todayParts.day) - 1,
  ));
  const yesterdayKey = [
    yesterdayUtc.getUTCFullYear(),
    String(yesterdayUtc.getUTCMonth() + 1).padStart(2, "0"),
    String(yesterdayUtc.getUTCDate()).padStart(2, "0"),
  ].join("-");

  if (messageKey === yesterdayKey) return "Ayer";

  return `${messageParts.day}/${messageParts.month}/${messageParts.year}`;
}
