"use client";

import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  EmptyState,
} from "@/components/dashboard/data-table";
import { Panel } from "@/components/dashboard/shell";
import {
  normalizeCustomerSearchValue,
  type CustomerSearchType,
} from "@/lib/customer-window/customer-search";

const PAGE_SIZE = 20;
const searchOptions: Array<{ label: string; value: CustomerSearchType }> = [
  { label: "Teléfono", value: "phone" },
  { label: "Email", value: "email" },
  { label: "Patente", value: "plate" },
  { label: "Código de reserva", value: "booking_code" },
  { label: "Customer ID origen", value: "source_customer_id" },
];

type SearchResult = {
  customer_id: string;
  identity_confidence: string | null;
  matched_identity_type: string;
  needs_review: boolean;
};

type CustomerSummary = Record<string, unknown> & {
  customerId: string;
  ok: boolean;
};

type Booking = Record<string, unknown> & { source_row_id: number };
type Timeline = { items: Booking[]; total: number };

function displayText(value: unknown, fallback = "No disponible") {
  return typeof value === "string" && value ? value : fallback;
}

function displayCount(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("es-CL") : "0";
}

function displayDate(value: unknown) {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw.split("-").reverse().join("-")
    : "No disponible";
}

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No fue posible completar la consulta.");
  return body;
}

export function CustomerWindowView() {
  const [section, setSection] = useState<"clientes" | "campanas">("clientes");
  const [searchType, setSearchType] = useState<CustomerSearchType>("phone");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchCustomers(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeCustomerSearchValue(searchType, query);
    if (!normalized) return;

    setLoading(true);
    setError(null);
    setSummary(null);
    setTimeline(null);
    try {
      const body = await getJson(
        `/api/orquestador/customer-window/customers?action=search&type=${searchType}&value=${encodeURIComponent(normalized)}&limit=20`,
      );
      setResults(Array.isArray(body.items) ? body.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible buscar clientes.");
    } finally {
      setLoading(false);
    }
  }

  async function selectCustomer(customerId: string) {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const [nextSummary, nextTimeline] = await Promise.all([
        getJson(`/api/orquestador/customer-window/customers?action=summary&customerId=${customerId}`),
        getJson(`/api/orquestador/customer-window/customers?action=bookings&customerId=${customerId}&page=1&pageSize=${PAGE_SIZE}`),
      ]);
      setSummary(nextSummary);
      setTimeline(nextTimeline);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el cliente.");
    } finally {
      setLoading(false);
    }
  }

  async function changePage(nextPage: number) {
    if (!summary) return;
    setLoading(true);
    setError(null);
    try {
      const nextTimeline = await getJson(
        `/api/orquestador/customer-window/customers?action=bookings&customerId=${summary.customerId}&page=${nextPage}&pageSize=${PAGE_SIZE}`,
      );
      setTimeline(nextTimeline);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil((timeline?.total ?? 0) / PAGE_SIZE));

  return (
    <section className="mt-5">
      <div className="flex gap-2 border-b border-[#d6e1ea]" role="tablist" aria-label="Customer Window">
        {(["clientes", "campanas"] as const).map((value) => (
          <button
            aria-selected={section === value}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${
              section === value ? "border-sea text-navy" : "border-transparent text-slate-500"
            }`}
            key={value}
            onClick={() => setSection(value)}
            role="tab"
            type="button"
          >
            {value === "clientes" ? "Clientes" : "Campañas"}
          </button>
        ))}
      </div>

      {section === "campanas" ? (
        <Panel title="Campañas">
          <p className="mt-4 text-sm text-slate-600">Próximamente.</p>
        </Panel>
      ) : (
        <>
          <Panel title="Clientes" description="Busca un cliente por una identidad o código conocido.">
            <form className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]" onSubmit={searchCustomers}>
              <label className="sr-only" htmlFor="customer-search-type">Tipo de búsqueda</label>
              <select
                className="rounded-lg border border-[#cbd8e3] bg-white px-3 py-2.5 text-sm"
                id="customer-search-type"
                onChange={(event) => setSearchType(event.target.value as CustomerSearchType)}
                value={searchType}
              >
                {searchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label className="sr-only" htmlFor="customer-search-value">Valor de búsqueda</label>
              <input
                className="min-w-0 rounded-lg border border-[#cbd8e3] px-3 py-2.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/20"
                id="customer-search-value"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ingresa el valor exacto"
                value={query}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                <Search className="h-4 w-4" />
                {loading ? "Buscando..." : "Buscar"}
              </button>
            </form>

            {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
            {results?.length === 0 ? (
              <div className="mt-4"><EmptyState title="Sin resultados" description="No encontramos clientes para la búsqueda indicada." /></div>
            ) : null}
            {results?.length ? (
              <div className="mt-4 divide-y divide-[#edf2f6] rounded-lg border border-[#d6e1ea]">
                {results.map((result) => (
                  <button
                    className="grid w-full gap-2 px-4 py-3 text-left hover:bg-[#f3f9fc] disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    disabled={loading}
                    key={result.customer_id}
                    onClick={() => selectCustomer(result.customer_id)}
                    type="button"
                  >
                    <span className="truncate font-mono text-sm text-navy">{result.customer_id}</span>
                    <span className="text-xs text-slate-600">{result.matched_identity_type}</span>
                    <span className="text-xs text-slate-600">{result.identity_confidence ?? "Sin confianza"}</span>
                    <span className="text-xs text-slate-600">{result.needs_review ? "Requiere revisión" : "Verificado"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Panel>

          {summary?.ok ? (
            <>
              <Panel title="Resumen del cliente" description={summary.customerId}>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Customer ID", summary.customerId],
                    ["Primera compra", displayDate(summary.firstPurchaseAt)],
                    ["Última compra", displayDate(summary.lastPurchaseAt)],
                    ["Compras", displayCount(summary.purchaseCount)],
                    ["Reservas futuras", displayCount(summary.futureBookingCount)],
                    ["MCP", displayCount(summary.mcpCount)],
                    ["EAP", displayCount(summary.eapCount)],
                    ["OKP", displayCount(summary.okpCount)],
                    ["Packs / No packs", `${displayCount(summary.packCount)} / ${displayCount(summary.nonPackCount)}`],
                    ["Última marca", displayText(summary.lastBrand)],
                    ["Último parking", displayText(summary.lastParking)],
                    ["Teléfonos conocidos", displayCount(summary.knownPhonesCount)],
                    ["Emails conocidos", displayCount(summary.knownEmailsCount)],
                    ["Patentes conocidas", displayCount(summary.knownPlatesCount)],
                    ["Revisión", summary.needsReview ? "Requiere revisión" : "Sin observaciones"],
                  ].map(([label, value]) => (
                    <div className="min-w-0" key={label}>
                      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-navy">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel title="Historial de compras" count={`${timeline?.total ?? 0} registros`}>
                <div className="mt-4">
                  <DataTable minWidth="900px">
                    <DataTableHead>
                      <DataTableRow>
                        {["Fecha compra", "Marca", "Parking", "Código reserva", "Estado", "Llegada", "Salida", "Duración", "Pack"].map((label) => (
                          <DataTableHeaderCell key={label}>{label}</DataTableHeaderCell>
                        ))}
                      </DataTableRow>
                    </DataTableHead>
                    <DataTableBody>
                      {(timeline?.items ?? []).map((booking) => (
                        <DataTableRow key={`${booking.source}-${booking.source_row_id}`}>
                          <DataTableCell>{displayDate(booking.purchase_created_at)}</DataTableCell>
                          <DataTableCell>{displayText(booking.brand)}</DataTableCell>
                          <DataTableCell>{displayText(booking.parking)}</DataTableCell>
                          <DataTableCell>{displayText(booking.source_booking_code)}</DataTableCell>
                          <DataTableCell>{displayText(booking.status)}</DataTableCell>
                          <DataTableCell>{displayDate(booking.planned_arrival_at)}</DataTableCell>
                          <DataTableCell>{displayDate(booking.planned_departure_at)}</DataTableCell>
                          <DataTableCell>{booking.duration_days === null ? "-" : displayCount(booking.duration_days)}</DataTableCell>
                          <DataTableCell>{booking.is_pack ? "Sí" : "No"}</DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || page <= 1} onClick={() => changePage(page - 1)} type="button">Anterior</button>
                  <span className="text-sm text-slate-600">Página {page} de {pageCount}</span>
                  <button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || page >= pageCount} onClick={() => changePage(page + 1)} type="button">Siguiente</button>
                </div>
              </Panel>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
