"use client";

import { useEffect, useMemo, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type {
  RecoveryCartAuditRow,
  RecoveryCartAuditStatus,
  RecoveryCartWhatsappStatus,
} from "@/lib/dashboard/data";
import { RecoveryCartChatDrawer } from "./recovery-cart-chat-drawer";

type RecoveryCartAuditTableProps = {
  error?: string | null;
  rows: RecoveryCartAuditRow[];
};

type StatusFilter = "all" | RecoveryCartAuditStatus;
type TypeFilter = "all" | "abandoned" | "canceled";
type WhatsappFilter = "all" | RecoveryCartWhatsappStatus;
type QuickFilter = "none" | "not_sent_or_without_tracking" | "sent_and_delivered" | "sent_and_failed" | "sent_and_read";
type SortDirection = "asc" | "desc";
type SortKey =
  | "amount"
  | "cart_date"
  | "confidence"
  | "contact"
  | "hours"
  | "message"
  | "parking"
  | "purchase_date"
  | "status"
  | "type";

const rowsPerPage = 20;

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

function formatDateOnly(value: string | null) {
  if (!value) return "-";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return formatDate(value);

  return `${day}/${month}/${year}`;
}

function formatHours(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `${Number(value).toFixed(1).replace(".", ",")} h`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
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

function whatsappStatusLabel(status: RecoveryCartWhatsappStatus) {
  if (status === "read") return "Leído";
  if (status === "delivered") return "Entregado";
  if (status === "sent") return "Enviado";
  if (status === "failed") return "Fallido";

  return "Sin seguimiento";
}

function whatsappStatusTone(status: RecoveryCartWhatsappStatus): BadgeTone {
  if (status === "read") return "success";
  if (status === "delivered") return "info";
  if (status === "sent") return "warning";
  if (status === "failed") return "danger";

  return "neutral";
}

function auditStatusLabel(status: RecoveryCartAuditStatus) {
  if (status === "recovered_with_amount") return "Recuperado con monto";
  if (status === "recovered_pack") return "Recuperado sin monto / pack";
  if (status === "expired") return "Carrito expirado";

  return "No recuperado";
}

function auditStatusTone(status: RecoveryCartAuditStatus): BadgeTone {
  if (status === "recovered_with_amount") return "success";
  if (status === "recovered_pack") return "info";
  if (status === "expired") return "warning";

  return "neutral";
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
  if (sortKey === "contact") return `${row.email ?? ""} ${row.phone ?? ""}`;
  if (sortKey === "hours") return Number(row.hours_to_purchase ?? -1);
  if (sortKey === "message") return `${messageSentLabel(row.message_sent)} ${row.whatsappStatus}`;
  if (sortKey === "status") return row.audit_status;
  if (sortKey === "type") return row.cart_type ?? "";
  if (sortKey === "parking") return row.parking_code ?? "";
  if (sortKey === "confidence") return row.confidence ?? "";

  return "";
}

function defaultSortDirection(sortKey: SortKey): SortDirection {
  if (sortKey === "amount" || sortKey === "cart_date" || sortKey === "hours" || sortKey === "purchase_date") {
    return "desc";
  }

  return "asc";
}

function quickFilterClass(active: boolean) {
  return [
    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
    active
      ? "border-sea bg-[#eaf6f7] text-navy"
      : "border-[#d6e1ea] bg-white text-slate-600 hover:border-sea hover:text-navy",
  ].join(" ");
}

export function RecoveryCartAuditTable({ error, rows }: RecoveryCartAuditTableProps) {
  const [dateQuery, setDateQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChatCartId, setSelectedChatCartId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [sortKey, setSortKey] = useState<SortKey>("cart_date");

  const visibleRows = useMemo(() => {
    return [...rows]
      .filter((row) => {
        if (statusFilter !== "all" && row.audit_status !== statusFilter) return false;
        if (typeFilter !== "all" && row.cart_type !== typeFilter) return false;
        if (whatsappFilter !== "all" && row.whatsappStatus !== whatsappFilter) return false;
        if (
          (quickFilter === "sent_and_delivered" || quickFilter === "sent_and_failed" || quickFilter === "sent_and_read") &&
          row.message_sent !== true
        ) {
          return false;
        }
        if (
          quickFilter === "not_sent_or_without_tracking" &&
          row.message_sent !== false &&
          row.whatsappStatus !== "sin_seguimiento"
        ) {
          return false;
        }
        if (dateQuery && dateInputValue(row.cart_form_datetime) !== dateQuery) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftValue = sortValue(left, sortKey);
        const rightValue = sortValue(right, sortKey);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
        }

        const comparison = String(leftValue).localeCompare(String(rightValue), "es-CL");

        return sortDirection === "desc" ? comparison * -1 : comparison;
      });
  }, [dateQuery, quickFilter, rows, sortDirection, sortKey, statusFilter, typeFilter, whatsappFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * rowsPerPage;
  const pageRows = visibleRows.slice(pageStartIndex, pageStartIndex + rowsPerPage);
  const showingFrom = visibleRows.length === 0 ? 0 : pageStartIndex + 1;
  const showingTo = Math.min(pageStartIndex + rowsPerPage, visibleRows.length);
  const auditSummary = useMemo(
    () => {
      const recoveredRows = visibleRows.filter((row) => row.recovered);
      const rowsWithHours = recoveredRows.filter(
        (row) => row.hours_to_purchase !== null && row.hours_to_purchase !== undefined,
      );
      const totalHours = rowsWithHours.reduce((total, row) => total + Number(row.hours_to_purchase ?? 0), 0);

      return {
        averageHours: rowsWithHours.length > 0 ? totalHours / rowsWithHours.length : null,
        delivered: visibleRows.filter((row) => row.whatsappStatus === "delivered").length,
        failed: visibleRows.filter((row) => row.whatsappStatus === "failed").length,
        notRecovered: visibleRows.filter((row) => row.audit_status === "not_recovered").length,
        read: visibleRows.filter((row) => row.whatsappStatus === "read").length,
        recovered: recoveredRows.length,
        recoveredAmount: recoveredRows.reduce((total, row) => total + Number(row.purchase_amount ?? 0), 0),
        total: visibleRows.length,
        withoutTracking: visibleRows.filter((row) => row.whatsappStatus === "sin_seguimiento").length,
      };
    },
    [visibleRows],
  );
  const auditFunnelCards = [
    { label: "Carritos perdidos", value: formatNumber(auditSummary.total) },
    { label: "No recuperados", value: formatNumber(auditSummary.notRecovered) },
    { label: "Recuperados", value: formatNumber(auditSummary.recovered) },
    { label: "Horas promedio", value: formatHours(auditSummary.averageHours) },
    { label: "Monto recuperado", value: formatCurrency(auditSummary.recoveredAmount) },
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [dateQuery, quickFilter, statusFilter, typeFilter, whatsappFilter]);

  function applyQuickFilter(
    status: StatusFilter,
    whatsapp: WhatsappFilter = "all",
    specialFilter: QuickFilter = "none",
  ) {
    setQuickFilter(specialFilter);
    setStatusFilter(status);
    setWhatsappFilter(whatsapp);
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(defaultSortDirection(nextSortKey));
  }

  function sortIndicator(headerSortKey: SortKey) {
    if (sortKey !== headerSortKey) return "";

    return sortDirection === "asc" ? " ↑" : " ↓";
  }

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

      <div className="flex flex-wrap items-center gap-2 border-b border-[#edf2f6] px-5 py-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Accesos rapidos
        </span>
        <button
          className={quickFilterClass(statusFilter === "not_recovered" && whatsappFilter === "all" && quickFilter === "none")}
          onClick={() => applyQuickFilter("not_recovered")}
          type="button"
        >
          Pendientes
        </button>
        <button
          className={quickFilterClass(quickFilter === "sent_and_read")}
          onClick={() => applyQuickFilter("all", "read", "sent_and_read")}
          type="button"
        >
          Enviado + leído
        </button>
        <button
          className={quickFilterClass(quickFilter === "sent_and_delivered")}
          onClick={() => applyQuickFilter("all", "delivered", "sent_and_delivered")}
          type="button"
        >
          Enviado + entregado
        </button>
        <button
          className={quickFilterClass(quickFilter === "sent_and_failed")}
          onClick={() => applyQuickFilter("all", "failed", "sent_and_failed")}
          type="button"
        >
          Enviado + fallido
        </button>
        <button
          className={quickFilterClass(quickFilter === "not_sent_or_without_tracking")}
          onClick={() => applyQuickFilter("all", "all", "not_sent_or_without_tracking")}
          type="button"
        >
          No enviado / sin seguimiento
        </button>
        <button
          className={quickFilterClass(statusFilter === "expired" && quickFilter === "none")}
          onClick={() => applyQuickFilter("expired")}
          type="button"
        >
          Expirados
        </button>
        <button
          className={quickFilterClass(statusFilter === "all" && whatsappFilter === "all" && quickFilter === "none")}
          onClick={() => applyQuickFilter("all")}
          type="button"
        >
          Todos
        </button>
      </div>

      <div className="grid gap-3 border-b border-[#edf2f6] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Fecha carrito
          <input
            aria-label="Fecha carrito"
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            lang="es-CL"
            onChange={(event) => setDateQuery(event.target.value)}
            type="date"
            value={dateQuery}
          />
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
            Formato: dd/mm/yyyy{dateQuery ? ` · ${formatDateOnly(dateQuery)}` : ""}
          </span>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Estado
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => {
              setQuickFilter("none");
              setStatusFilter(event.target.value as StatusFilter);
            }}
            value={statusFilter}
          >
            <option value="all">Todos</option>
            <option value="recovered_with_amount">Recuperado con monto</option>
            <option value="recovered_pack">Recuperado sin monto / pack</option>
            <option value="expired">Carrito expirado</option>
            <option value="not_recovered">No recuperado</option>
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
          Estado WhatsApp
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => {
              setQuickFilter("none");
              setWhatsappFilter(event.target.value as WhatsappFilter);
            }}
            value={whatsappFilter}
          >
            <option value="all">Todos</option>
            <option value="read">Leído</option>
            <option value="delivered">Entregado</option>
            <option value="sent">Enviado</option>
            <option value="failed">Fallido</option>
            <option value="sin_seguimiento">Sin seguimiento</option>
          </select>
        </label>

      </div>

      {!error ? (
        <div className="border-b border-[#edf2f6] px-5 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-navy">Resumen de auditoria filtrada</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Calculado sobre las filas que cumplen los filtros actuales, antes de la paginacion.
            </p>
          </div>
          <div className="grid gap-2 lg:grid-cols-5">
            {auditFunnelCards.map((item) => (
              <div className="relative rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={item.label}>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-medium text-navy">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
          <div>
          <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-xs">
            <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <SortableHeader className="w-[7%]" label="Tipo" onSort={() => handleSort("type")} sortIndicator={sortIndicator("type")} />
                <SortableHeader className="w-[21%]" label="Contacto" onSort={() => handleSort("contact")} sortIndicator={sortIndicator("contact")} />
                <SortableHeader className="w-[7%]" label="Parking" onSort={() => handleSort("parking")} sortIndicator={sortIndicator("parking")} />
                <SortableHeader className="w-[10%]" label="Mensaje" onSort={() => handleSort("message")} sortIndicator={sortIndicator("message")} />
                <SortableHeader className="w-[12%]" label="Fecha carrito" onSort={() => handleSort("cart_date")} sortIndicator={sortIndicator("cart_date")} />
                <SortableHeader className="w-[12%]" label="Estado" onSort={() => handleSort("status")} sortIndicator={sortIndicator("status")} />
                <SortableHeader className="w-[10%]" label="Fecha compra" onSort={() => handleSort("purchase_date")} sortIndicator={sortIndicator("purchase_date")} />
                <SortableHeader className="w-[6%]" label="Horas" onSort={() => handleSort("hours")} sortIndicator={sortIndicator("hours")} />
                <SortableHeader className="w-[6%]" label="Monto" onSort={() => handleSort("amount")} sortIndicator={sortIndicator("amount")} />
                <SortableHeader className="w-[7%]" label="Conf." onSort={() => handleSort("confidence")} sortIndicator={sortIndicator("confidence")} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr className="bg-white odd:bg-[#fbfdfe]" key={row.id}>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.cart_type ?? "Sin tipo"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div className="break-all font-medium text-navy">{row.email ?? "Sin correo"}</div>
                    <div className="mt-1 break-all text-[11px] text-slate-500">{row.phone ?? "Sin telefono"}</div>
                    <button
                      className="mt-2 rounded-md border border-[#d6e1ea] bg-white px-2 py-1 text-[11px] font-medium text-navy hover:border-sea hover:bg-[#f8fafb]"
                      onClick={() => setSelectedChatCartId(row.id)}
                      type="button"
                    >
                      Ver chat
                    </button>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.parking_code ?? "Sin parking"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <ValueBadge tone={messageSentTone(row.message_sent)}>
                        {messageSentLabel(row.message_sent)}
                      </ValueBadge>
                      <ValueBadge tone={whatsappStatusTone(row.whatsappStatus)}>
                        {whatsappStatusLabel(row.whatsappStatus)}
                      </ValueBadge>
                    </div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div>{formatDate(row.cart_form_datetime)}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Salida: {formatDateOnly(row.intended_departure_date)}
                    </div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={auditStatusTone(row.audit_status)}>
                      {auditStatusLabel(row.audit_status)}
                    </ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(row.purchase_created_at)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatHours(row.hours_to_purchase)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 font-medium text-navy">
                    {row.recovered ? formatCurrency(row.purchase_amount) : "-"}
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
          <div className="mt-4 flex flex-col gap-3 border-t border-[#edf2f6] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando {showingFrom}-{showingTo} de {visibleRows.length}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-45"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                type="button"
              >
                Anterior
              </button>
              <button
                className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-45"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <RecoveryCartChatDrawer cartId={selectedChatCartId} onClose={() => setSelectedChatCartId(null)} />
    </section>
  );
}

function SortableHeader({
  className,
  label,
  onSort,
  sortIndicator,
}: {
  className: string;
  label: string;
  onSort: () => void;
  sortIndicator: string;
}) {
  return (
    <th className={`${className} border-b border-[#d6e1ea] px-2 py-3`}>
      <button className="text-left font-medium uppercase tracking-[0.08em] hover:text-navy" onClick={onSort} type="button">
        {label}
        {sortIndicator}
      </button>
    </th>
  );
}
