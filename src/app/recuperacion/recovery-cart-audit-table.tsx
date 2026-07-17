"use client";

import { useMemo, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecoveryCartAuditRow } from "@/lib/dashboard/data";

type RecoveryCartAuditTableProps = {
  error?: string | null;
  rows: RecoveryCartAuditRow[];
};

type StatusFilter = "all" | "recovered" | "not_recovered";
type TypeFilter = "all" | "abandoned" | "canceled";
type SortKey = "cart_date" | "purchase_date" | "amount" | "status" | "type" | "parking" | "confidence";

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `$${new Intl.NumberFormat("es-CL").format(Math.round(value))}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatHours(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `${Number(value).toFixed(1).replace(".", ",")} h`;
}

function dateInputValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function messageSentLabel(value: boolean | null) {
  if (value === true) return "Enviado";
  if (value === false) return "No enviado";

  return "Sin dato";
}

function messageSentTone(value: boolean | null): BadgeTone {
  if (value === true) return "success";
  if (value === false) return "neutral";

  return "warning";
}

function statusTone(recovered: boolean): BadgeTone {
  return recovered ? "success" : "neutral";
}

function confidenceTone(confidence: string | null): BadgeTone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  if (confidence === "low") return "neutral";

  return "neutral";
}

function sortValue(row: RecoveryCartAuditRow, sortKey: SortKey) {
  if (sortKey === "cart_date") return row.cart_form_datetime ? new Date(row.cart_form_datetime).getTime() : 0;
  if (sortKey === "purchase_date") return row.purchase_created_at ? new Date(row.purchase_created_at).getTime() : 0;
  if (sortKey === "amount") return Number(row.purchase_amount ?? -1);
  if (sortKey === "status") return row.recovered ? 1 : 0;
  if (sortKey === "type") return row.cart_type ?? "";
  if (sortKey === "parking") return row.parking_code ?? "";
  if (sortKey === "confidence") return row.confidence ?? "";

  return "";
}

export function RecoveryCartAuditTable({ error, rows }: RecoveryCartAuditTableProps) {
  const [dateQuery, setDateQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cart_date");

  const visibleRows = useMemo(() => {
    return [...rows]
      .filter((row) => {
        if (statusFilter === "recovered" && !row.recovered) return false;
        if (statusFilter === "not_recovered" && row.recovered) return false;
        if (typeFilter !== "all" && row.cart_type !== typeFilter) return false;
        if (dateQuery && dateInputValue(row.cart_form_datetime) !== dateQuery) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftValue = sortValue(left, sortKey);
        const rightValue = sortValue(right, sortKey);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return rightValue - leftValue;
        }

        return String(leftValue).localeCompare(String(rightValue), "es-CL");
      });
  }, [dateQuery, rows, sortKey, statusFilter, typeFilter]);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Auditoria de carritos</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Vista interna para revisar carritos recuperados y no recuperados. Muestra contacto normalizado; no incluye identificadores de reserva ni payloads.
          </p>
        </div>
        <ValueBadge tone="info">{visibleRows.length} visibles</ValueBadge>
      </div>

      <div className="grid gap-3 border-b border-[#edf2f6] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Fecha carrito
          <input
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => setDateQuery(event.target.value)}
            type="date"
            value={dateQuery}
          />
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Estado
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="all">Todos</option>
            <option value="recovered">Recuperados</option>
            <option value="not_recovered">No recuperados</option>
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Tipo
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            value={typeFilter}
          >
            <option value="all">Todos</option>
            <option value="abandoned">abandoned</option>
            <option value="canceled">canceled</option>
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Ordenar por
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            value={sortKey}
          >
            <option value="cart_date">Fecha carrito</option>
            <option value="purchase_date">Fecha compra</option>
            <option value="amount">Monto</option>
            <option value="status">Estado</option>
            <option value="type">Tipo</option>
            <option value="parking">Parking</option>
            <option value="confidence">Confianza</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar la auditoria de carritos: {error}
          </p>
        </div>
      ) : null}

      {!error && visibleRows.length === 0 ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay carritos para los filtros seleccionados.
          </p>
        </div>
      ) : null}

      {!error && visibleRows.length > 0 ? (
        <div className="px-5 py-5">
          <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-xs">
            <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[9%] border-b border-[#d6e1ea] px-2 py-3">Tipo</th>
                <th className="w-[21%] border-b border-[#d6e1ea] px-2 py-3">Contacto</th>
                <th className="w-[8%] border-b border-[#d6e1ea] px-2 py-3">Parking</th>
                <th className="w-[9%] border-b border-[#d6e1ea] px-2 py-3">Mensaje</th>
                <th className="w-[12%] border-b border-[#d6e1ea] px-2 py-3">Fecha carrito</th>
                <th className="w-[10%] border-b border-[#d6e1ea] px-2 py-3">Estado</th>
                <th className="w-[12%] border-b border-[#d6e1ea] px-2 py-3">Fecha compra</th>
                <th className="w-[7%] border-b border-[#d6e1ea] px-2 py-3">Horas</th>
                <th className="w-[7%] border-b border-[#d6e1ea] px-2 py-3">Monto</th>
                <th className="w-[8%] border-b border-[#d6e1ea] px-2 py-3">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr className="bg-white odd:bg-[#fbfdfe]" key={`${row.cart_form_datetime ?? "cart"}-${index}`}>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.cart_type ?? "Sin tipo"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div className="break-all font-medium text-navy">{row.email ?? "Sin correo"}</div>
                    <div className="mt-1 break-all text-[11px] text-slate-500">{row.phone ?? "Sin telefono"}</div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.parking_code ?? "Sin parking"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={messageSentTone(row.message_sent)}>
                      {messageSentLabel(row.message_sent)}
                    </ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(row.cart_form_datetime)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={statusTone(row.recovered)}>
                      {row.recovered ? "Recuperado" : "No recuperado"}
                    </ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(row.purchase_created_at)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatHours(row.hours_to_purchase)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 font-medium text-navy">
                    {formatCurrency(row.purchase_amount)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    {row.confidence ? (
                      <ValueBadge tone={confidenceTone(row.confidence)}>{row.confidence}</ValueBadge>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
