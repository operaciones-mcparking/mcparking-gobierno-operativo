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

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

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


function intentTooltipItems(row: RecoveryCartAuditRow): Array<[string, string]> {
  const items: Array<[string, string]> = [];

  if (row.lastInboundIntentCategory) {
    items.push(["intent_category", row.lastInboundIntentCategory]);
    items.push(["Intenci\u00f3n", row.lastInboundIntentCategory]);
  }

  if (row.lastInboundSentiment) items.push(["Sentimiento", row.lastInboundSentiment]);
  if (row.lastInboundChatState) items.push(["Chat", row.lastInboundChatState]);
  if (row.hasChat) items.push(["Mensajes", formatNumber(row.chatMessageCount)]);

  return items;
}

function intentTooltipTitle(row: RecoveryCartAuditRow) {
  const items = intentTooltipItems(row);

  if (items.length === 0) return row.hasChat ? "Chat disponible" : "Sin chat asociado";

  return items.map(([label, value]) => `${label}: ${value}`).join(" | ");
}


export function RecoveryCartAuditTable({ error, rows }: RecoveryCartAuditTableProps) {
  const [dateQuery, setDateQuery] = useState(() => todayInputValue());
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
  }, [dateQuery, rows, sortDirection, sortKey, statusFilter, typeFilter, whatsappFilter]);

  const hasDateFilter = Boolean(dateQuery);
  const totalPages = hasDateFilter ? 1 : Math.max(1, Math.ceil(visibleRows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = hasDateFilter ? 0 : (safeCurrentPage - 1) * rowsPerPage;
  const pageRows = hasDateFilter ? visibleRows : visibleRows.slice(pageStartIndex, pageStartIndex + rowsPerPage);
  const showingFrom = visibleRows.length === 0 ? 0 : pageStartIndex + 1;
  const showingTo = hasDateFilter ? visibleRows.length : Math.min(pageStartIndex + rowsPerPage, visibleRows.length);
  const shouldShowPaginationControls = !hasDateFilter && totalPages > 1;
  const auditSummary = useMemo(
    () => {
      const recoveredRows = visibleRows.filter((row) => row.recovered);

      return {
        delivered: visibleRows.filter((row) => row.whatsappStatus === "delivered" || row.whatsappStatus === "read").length,
        read: visibleRows.filter((row) => row.whatsappStatus === "read").length,
        recovered: recoveredRows.length,
        recoveredAmount: recoveredRows.reduce((total, row) => total + Number(row.purchase_amount ?? 0), 0),
        sent: visibleRows.filter((row) => row.message_sent === true).length,
        total: visibleRows.length,
      };
    },
    [visibleRows],
  );
  const auditFunnelCards = [
    { label: "Carritos filtrados", value: formatNumber(auditSummary.total) },
    { label: "Enviados", value: formatNumber(auditSummary.sent) },
    { label: "Entregados", value: formatNumber(auditSummary.delivered) },
    { label: "Leídos", value: formatNumber(auditSummary.read) },
    { label: "Recuperados", value: formatNumber(auditSummary.recovered) },
    { label: "Monto recuperado", value: formatCurrency(auditSummary.recoveredAmount) },
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [dateQuery, statusFilter, typeFilter, whatsappFilter]);


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


      <div className="grid gap-3 border-b border-[#edf2f6] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          <span>Fecha carrito</span>
          <input
            aria-label="Fecha carrito"
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            lang="es-CL"
            onChange={(event) => setDateQuery(event.target.value)}
            type="date"
            value={dateQuery}
          />
          <div className="mt-2 flex flex-wrap gap-2 normal-case tracking-normal">
            <button
              className="rounded-full border border-[#d6e1ea] bg-white px-3 py-1 text-xs font-medium text-navy transition hover:border-sea"
              onClick={() => setDateQuery(todayInputValue())}
              type="button"
            >
              Hoy
            </button>
            <button
              className="rounded-full border border-[#d6e1ea] bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-sea hover:text-navy"
              onClick={() => setDateQuery("")}
              type="button"
            >
              Limpiar fecha
            </button>
          </div>
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
            Formato: dd/mm/yyyy{dateQuery ? ` · ${formatDateOnly(dateQuery)}` : ""}
          </span>
        </div>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Estado
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => {
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
            <h3 className="text-sm font-medium text-navy">Conversaciones de la auditoria filtrada</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Calculado sobre los carritos que cumplen los filtros actuales.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
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
              {pageRows.map((row) => {
                const canOpenChat = row.hasChat === true;

                return (
                <tr
                  aria-label={canOpenChat ? "Ver chat del carrito" : undefined}
                  className={`group bg-white transition odd:bg-[#fbfdfe] ${canOpenChat ? "cursor-pointer hover:bg-[#eef7f8]" : "cursor-default"}`}
                  key={row.id}
                  onClick={canOpenChat ? () => setSelectedChatCartId(row.id) : undefined}
                  onKeyDown={canOpenChat ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedChatCartId(row.id);
                    }
                  } : undefined}
                  role={canOpenChat ? "button" : undefined}
                  tabIndex={canOpenChat ? 0 : undefined}
                  title={intentTooltipTitle(row)}
                >
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.cart_type ?? "Sin tipo"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div className="flex items-center gap-1.5 font-medium text-navy">
                      <span className="min-w-0 break-all">{row.email ?? "Sin correo"}</span>
                      <span
                        aria-label={row.hasChat ? `Chat disponible: ${formatNumber(row.chatMessageCount)} mensajes` : "Sin chat asociado"}
                        className={`h-2 w-2 shrink-0 rounded-full ${row.hasChat ? "bg-sea" : "bg-slate-300"}`}
                        title={row.hasChat ? `Chat disponible: ${formatNumber(row.chatMessageCount)} mensajes` : "Sin chat asociado"}
                      />
                    </div>
                    <div className="mt-1 break-all text-[11px] text-slate-500">{row.phone ?? "Sin telefono"}</div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.parking_code ?? "Sin parking"}
                  </td>
                  <td className="relative border-b border-[#edf2f6] px-2 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <ValueBadge tone={messageSentTone(row.message_sent)}>
                        {messageSentLabel(row.message_sent)}
                      </ValueBadge>
                      <ValueBadge tone={whatsappStatusTone(row.whatsappStatus)}>
                        {whatsappStatusLabel(row.whatsappStatus)}
                      </ValueBadge>
                    </div>
                    {intentTooltipItems(row).length > 0 ? (
                      <div className="pointer-events-none absolute left-2 top-full z-30 mt-2 hidden w-56 rounded-lg border border-[#d6e1ea] bg-white p-3 text-[11px] leading-4 text-slate-600 shadow-[0_12px_28px_rgba(2,53,116,0.16)] group-hover:block group-focus:block">
                        {intentTooltipItems(row).map(([label, value]) => (
                          <div key={label}>
                            <span className="font-medium text-navy">{label}:</span> {value}
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-[#edf2f6] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {hasDateFilter
                ? `Mostrando ${formatNumber(visibleRows.length)} de ${formatNumber(visibleRows.length)}`
                : `Mostrando ${formatNumber(showingFrom)}-${formatNumber(showingTo)} de ${formatNumber(visibleRows.length)}`}
            </p>
            {shouldShowPaginationControls ? (
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
            ) : null}
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
