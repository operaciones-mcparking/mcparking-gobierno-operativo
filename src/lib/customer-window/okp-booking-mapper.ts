import "server-only";

import { createHash } from "node:crypto";

import {
  normalizeEmail,
  normalizePhone,
  normalizePrice,
} from "../../../scripts/recovery/recovery-normalizers.js";

export type OkpBookingSourceRow = {
  ID_BL?: unknown;
  J2_descuento?: unknown;
  J2_dias_pagados_paquete?: unknown;
  J2_paquetes?: unknown;
  J2_valorTotal?: unknown;
  J3_codcupon?: unknown;
  J3_montocupon?: unknown;
  admission?: unknown;
  apellido?: unknown;
  confirmada?: unknown;
  createdAt?: unknown;
  departure?: unknown;
  emailfactura?: unknown;
  fh_confirma_entrada?: unknown;
  fh_confirma_salida?: unknown;
  fono?: unknown;
  id_sede?: unknown;
  inactiva?: unknown;
  nombre?: unknown;
  numreserva?: unknown;
  pagado?: unknown;
  patente?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  valorReserva?: unknown;
  vanPassengers?: unknown;
};

export type CustomerSourceBookingOkpInsert = {
  actual_checkin_at: string | null;
  actual_checkout_at: string | null;
  coupon_amount: number | null;
  coupon_code: string | null;
  discount_amount: number | null;
  email_normalized: string | null;
  email_raw: string | null;
  is_confirmed: boolean | null;
  is_inactive: boolean | null;
  is_pack: boolean;
  is_paid: boolean | null;
  j2_paquetes_raw: string | null;
  pack_code: string | null;
  pack_paid_days: number | null;
  pack_payload: unknown | null;
  pack_reference: string | null;
  parking_normalized: string | null;
  passenger_count: number | null;
  phone_normalized: string | null;
  phone_raw: string | null;
  planned_arrival_at: string | null;
  planned_departure_at: string | null;
  plate_normalized: string | null;
  plate_raw: string | null;
  row_hash: string;
  source: "OKP";
  source_booking_code: string | null;
  source_created_at: string | null;
  source_row_id: number;
  source_site_id: string | null;
  source_total_amount: number | null;
  source_updated_at: string | null;
  status_raw: string | null;
  valor_reserva_amount: number | null;
  valor_reserva_raw: string | null;
};

const PARKING_BY_SOURCE_SITE: Readonly<Record<string, string>> = {
  "1560F317_05F7_416B_8E30_E17950F6ACC2": "OKP_PREMIUM",
  "31B57B05_ED68_421A_BF0F_F6520C3F65B4": "OKP_RC",
  "7ECE5C1A_40A4_49AE_AA24_96B21FC39C42": "OKP_FIDAE",
  "BE352BF1_38A7_42D4_9169_AC5EA653D34A": "OKP_EXP",
  EXPRESS: "OKP_EXP",
  FIDAE: "OKP_FIDAE",
  PREMIUM: "OKP_PREMIUM",
  RC: "OKP_RC",
};

function rawText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function cleanText(value: unknown): string | null {
  const text = rawText(value)?.trim() ?? "";
  return text ? text : null;
}

function sourceRowId(value: unknown): number | null {
  const text = cleanText(value);
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const text = cleanText(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function conservativeBoolean(value: unknown): boolean | null {
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function normalizePlate(value: unknown): string | null {
  const normalized = cleanText(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return normalized || null;
}

function localTimestamp(value: unknown): string | null {
  const text = cleanText(value);
  if (!text || /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (
    probe.getUTCFullYear() !== Number(year) ||
    probe.getUTCMonth() + 1 !== Number(month) ||
    probe.getUTCDate() !== Number(day) ||
    probe.getUTCHours() !== Number(hour) ||
    probe.getUTCMinutes() !== Number(minute) ||
    probe.getUTCSeconds() !== Number(second)
  ) return null;

  return `${year}-${month}-${day} ${hour}:${minute}:${second}${fraction}`;
}

function parseJsonSafely(value: unknown): { payload: unknown | null; raw: string | null } {
  const raw = rawText(value);
  if (raw === null || !raw.trim()) return { payload: null, raw };
  try {
    return { payload: JSON.parse(raw), raw };
  } catch {
    return { payload: null, raw };
  }
}

function collectExactKeyValues(value: unknown, key: "codtransa" | "codigo", found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectExactKeyValues(item, key, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key) {
      const text = cleanText(entryValue);
      if (text) found.add(text);
    } else if (entryValue && typeof entryValue === "object") {
      collectExactKeyValues(entryValue, key, found);
    }
  }
  return found;
}

function onlyValue(values: Set<string>): string | null {
  return values.size === 1 ? [...values][0] : null;
}

function parkingNormalized(value: unknown): string | null {
  const key = cleanText(value)?.toUpperCase().replace(/[\s-]+/g, "_") ?? "";
  return PARKING_BY_SOURCE_SITE[key] ?? null;
}

export function mapOkpBookingSourceRow(row: OkpBookingSourceRow): CustomerSourceBookingOkpInsert {
  const id = sourceRowId(row.ID_BL);
  if (id === null) throw new Error("ID_BL must be a non-negative safe integer.");

  const pack = parseJsonSafely(row.J2_paquetes);
  const packPaidDays = nonNegativeInteger(row.J2_dias_pagados_paquete);
  const packReferences = collectExactKeyValues(pack.payload, "codtransa");
  const packCodes = collectExactKeyValues(pack.payload, "codigo");
  const contractual = {
    actual_checkin_at: localTimestamp(row.fh_confirma_entrada),
    actual_checkout_at: localTimestamp(row.fh_confirma_salida),
    coupon_amount: normalizePrice(row.J3_montocupon),
    coupon_code: cleanText(row.J3_codcupon),
    discount_amount: normalizePrice(row.J2_descuento),
    email_normalized: normalizeEmail(row.emailfactura),
    email_raw: rawText(row.emailfactura),
    is_confirmed: conservativeBoolean(row.confirmada),
    is_inactive: conservativeBoolean(row.inactiva),
    is_pack: Boolean((packPaidDays ?? 0) > 0 || packReferences.size > 0),
    is_paid: conservativeBoolean(row.pagado),
    j2_paquetes_raw: pack.raw,
    pack_code: onlyValue(packCodes),
    pack_paid_days: packPaidDays,
    pack_payload: pack.payload,
    pack_reference: onlyValue(packReferences),
    parking_normalized: parkingNormalized(row.id_sede),
    passenger_count: nonNegativeInteger(row.vanPassengers),
    phone_normalized: normalizePhone(row.fono),
    phone_raw: rawText(row.fono),
    planned_arrival_at: localTimestamp(row.admission),
    planned_departure_at: localTimestamp(row.departure),
    plate_normalized: normalizePlate(row.patente),
    plate_raw: rawText(row.patente),
    source: "OKP" as const,
    source_booking_code: cleanText(row.numreserva),
    source_created_at: localTimestamp(row.createdAt),
    source_row_id: id,
    source_site_id: cleanText(row.id_sede),
    source_total_amount: normalizePrice(row.J2_valorTotal),
    source_updated_at: localTimestamp(row.updatedAt),
    status_raw: cleanText(row.status),
    valor_reserva_amount: normalizePrice(row.valorReserva),
    valor_reserva_raw: rawText(row.valorReserva),
  };

  return {
    ...contractual,
    row_hash: createHash("sha256").update(JSON.stringify(contractual), "utf8").digest("hex"),
  };
}
