import "server-only";

import { createHash } from "node:crypto";

import {
  normalizeEmail,
  normalizePhone,
  normalizePrice,
} from "../../../scripts/recovery/recovery-normalizers.js";

export type McpEapBookingSourceRow = {
  Abreisedatum?: unknown;
  Abreisezeit?: unknown;
  Anreisedatum?: unknown;
  Anreisezeit?: unknown;
  BookingPaid?: unknown;
  BookingStatus?: unknown;
  Buchungsnummer?: unknown;
  Buchungszeit?: unknown;
  CustomerId?: unknown;
  Dauer?: unknown;
  Email?: unknown;
  Id?: unknown;
  Kennzeichen?: unknown;
  ParkingCode?: unknown;
  PayingStatus?: unknown;
  Personenzahl?: unknown;
  Preis?: unknown;
  PromotionCode?: unknown;
  PromotionCodeCalculatedValue?: unknown;
  SubDaysUsed?: unknown;
  Telefon?: unknown;
  Website?: unknown;
};

export type CustomerSourceBookingMcpEapInsert = {
  booking_paid: number | null;
  booking_status: number;
  brand_normalized: "MCP" | "EAP";
  duration_days: number | null;
  email_normalized: string | null;
  email_raw: string | null;
  is_pack: boolean;
  parking_code_raw: string | null;
  parking_normalized: "MCPARKING" | "MCPARKING VESPUCIO" | "ESTACIONAMIENTO AEROPUERTO";
  passenger_count: number | null;
  paying_status: number | null;
  phone_normalized: string | null;
  phone_raw: string | null;
  planned_arrival_at: string | null;
  planned_departure_at: string | null;
  plate_normalized: string | null;
  plate_raw: string | null;
  promotion_code: string | null;
  promotion_discount_amount: number | null;
  row_hash: string;
  source: "MCP_EAP";
  source_booking_code: string;
  source_created_at: string;
  source_customer_id: number;
  source_row_id: number;
  source_total_amount: number | null;
  sub_days_used: number | null;
  website_source: number;
};

function rawText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function cleanText(value: unknown): string | null {
  const text = rawText(value)?.trim() ?? "";
  return text || null;
}

function positiveSafeInteger(value: unknown, field: string): number {
  const text = cleanText(value);
  if (!text || !/^\d+$/.test(text)) throw new Error(`${field} must be a positive safe integer.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive safe integer.`);
  return parsed;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  const text = cleanText(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requiredInteger(value: unknown, field: string): number {
  const text = cleanText(value);
  if (!text || !/^-?\d+$/.test(text)) throw new Error(`${field} must be an integer.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be an integer.`);
  return parsed;
}

function normalizePlate(value: unknown): string | null {
  const normalized = cleanText(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return normalized || null;
}

function validParts(year: string, month: string, day: string, hour: string, minute: string, second: string) {
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return probe.getUTCFullYear() === Number(year)
    && probe.getUTCMonth() + 1 === Number(month)
    && probe.getUTCDate() === Number(day)
    && probe.getUTCHours() === Number(hour)
    && probe.getUTCMinutes() === Number(minute)
    && probe.getUTCSeconds() === Number(second);
}

function localTimestamp(value: unknown): string | null {
  const text = cleanText(value);
  if (!text || /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  if (!validParts(year, month, day, hour, minute, second)) return null;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}${fraction}`;
}

function localDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  const dayFirst = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const year = iso?.[1] ?? dayFirst?.[3];
  const month = iso?.[2] ?? dayFirst?.[2];
  const day = iso?.[3] ?? dayFirst?.[1];
  if (!year || !month || !day || !validParts(year, month, day, "00", "00", "00")) return null;
  return `${year}-${month}-${day}`;
}

function localTime(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, hour, minute, second = "00"] = match;
  if (!validParts("2000", "01", "01", hour, minute, second)) return null;
  return `${hour}:${minute}:${second}`;
}

function combineLocalDateTime(dateValue: unknown, timeValue: unknown): string | null {
  const date = localDate(dateValue);
  const time = localTime(timeValue);
  return date && time ? `${date} ${time}` : null;
}

function normalizeBrandAndParking(website: number, parkingCode: string | null) {
  const normalizedParkingCode = parkingCode?.trim().toUpperCase() ?? null;
  if (website === 2) return { brand: "EAP" as const, parking: "ESTACIONAMIENTO AEROPUERTO" as const };
  if (website === 1 || website === 4) {
    return normalizedParkingCode === "MPV"
      ? { brand: "MCP" as const, parking: "MCPARKING VESPUCIO" as const }
      : { brand: "MCP" as const, parking: "MCPARKING" as const };
  }
  throw new Error("Website must be 1, 2, or 4.");
}

export function mapMcpEapBookingSourceRow(row: McpEapBookingSourceRow): CustomerSourceBookingMcpEapInsert {
  const sourceRowId = positiveSafeInteger(row.Id, "Id");
  const sourceCustomerId = positiveSafeInteger(row.CustomerId, "CustomerId");
  const sourceBookingCode = cleanText(row.Buchungsnummer);
  if (!sourceBookingCode) throw new Error("Buchungsnummer is required.");
  const bookingStatus = requiredInteger(row.BookingStatus, "BookingStatus");
  const website = requiredInteger(row.Website, "Website");
  const sourceCreatedAt = localTimestamp(row.Buchungszeit);
  if (!sourceCreatedAt) throw new Error("Buchungszeit must be a timezone-free source timestamp.");

  const parkingCodeRaw = rawText(row.ParkingCode);
  const { brand, parking } = normalizeBrandAndParking(website, parkingCodeRaw);
  const sourceTotalAmount = normalizePrice(row.Preis);
  const bookingPaid = normalizePrice(row.BookingPaid);
  const promotionDiscountAmount = normalizePrice(row.PromotionCodeCalculatedValue);
  const subDaysUsed = nullableNonNegativeInteger(row.SubDaysUsed);
  const contractual = {
    booking_paid: bookingPaid,
    booking_status: bookingStatus,
    brand_normalized: brand,
    duration_days: nullableNonNegativeInteger(row.Dauer),
    email_normalized: normalizeEmail(row.Email),
    email_raw: rawText(row.Email),
    is_pack: bookingPaid === 0
      && sourceTotalAmount === 0
      && (promotionDiscountAmount ?? 0) === 0
      && (subDaysUsed ?? 0) > 0,
    parking_code_raw: parkingCodeRaw,
    parking_normalized: parking,
    passenger_count: nullableNonNegativeInteger(row.Personenzahl),
    paying_status: nullableNonNegativeInteger(row.PayingStatus),
    phone_normalized: normalizePhone(row.Telefon),
    phone_raw: rawText(row.Telefon),
    planned_arrival_at: combineLocalDateTime(row.Anreisedatum, row.Anreisezeit),
    planned_departure_at: combineLocalDateTime(row.Abreisedatum, row.Abreisezeit),
    plate_normalized: normalizePlate(row.Kennzeichen),
    plate_raw: rawText(row.Kennzeichen),
    promotion_code: cleanText(row.PromotionCode),
    promotion_discount_amount: promotionDiscountAmount,
    source: "MCP_EAP" as const,
    source_booking_code: sourceBookingCode,
    source_created_at: sourceCreatedAt,
    source_customer_id: sourceCustomerId,
    source_row_id: sourceRowId,
    source_total_amount: sourceTotalAmount,
    sub_days_used: subDaysUsed,
    website_source: website,
  };

  return {
    ...contractual,
    row_hash: createHash("sha256").update(JSON.stringify(contractual), "utf8").digest("hex"),
  };
}
