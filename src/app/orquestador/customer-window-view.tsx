"use client";

import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableHead,
  EmptyState,
} from "@/components/dashboard/data-table";
import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { Panel } from "@/components/dashboard/panel";
import {
  getCustomerPeriodRange,
  getSantiagoDateKey,
  isValidCustomerPeriodRange,
  type CustomerPeriodPreset,
  type CustomerPeriodRange,
} from "@/lib/customer-window/customer-period";
import {
  formatCustomerMetricPercentage,
  formatCustomerTierLabel,
  normalizeCustomerPeriodMetrics,
  type CustomerPeriodMetrics,
} from "@/lib/customer-window/customer-period-metrics";

const TIMELINE_PAGE_SIZE = 20;
const PERIOD_PAGE_SIZE = 25;
const periodOptions: Array<{ label: string; value: CustomerPeriodPreset }> = [
  { label: "Hoy", value: "today" },
  { label: "Ayer", value: "yesterday" },
  { label: "Últimos 7 días", value: "last7" },
  { label: "Últimos 14 días", value: "last14" },
  { label: "Este mes", value: "thisMonth" },
  { label: "Mes anterior", value: "previousMonth" },
  { label: "Personalizado", value: "custom" },
];

type CustomerFamily = "MCP_EAP" | "OKP";
type CustomPeriodMode = "single" | "range";
type CustomerFilterKey = "brandBehavior" | "lifecycleStatus" | "packStatus" | "tier";
type CustomerFilters = Record<CustomerFilterKey, string>;
type PeriodCustomer = {
  brandBehavior: string | null;
  customerId: string;
  eapCount: number;
  emails: string[];
  firstPurchaseInPeriod: string | null;
  lastPurchaseAt: string | null;
  lastPurchaseInPeriod: string | null;
  lifecycleStatus: string | null;
  mcpCount: number;
  needsReview: boolean;
  okpCount: number;
  okpExpressCount: number;
  okpOtrosCount: number;
  okpRioClarilloCount: number;
  packStatus: string | null;
  phones: string[];
  purchasesInPeriod: number;
  tier: string | null;
  totalReservations: number;
};
type PeriodList = { items: PeriodCustomer[]; page: number; pageSize: number; total: number };
type CustomerSummary = Record<string, unknown> & { customerId: string; ok: boolean };
type Booking = Record<string, unknown> & { source_row_id: number };
type Timeline = { items: Booking[]; total: number };
type ClassificationCriteria = Record<string, unknown>;

const emptyPeriodList: PeriodList = { items: [], page: 1, pageSize: PERIOD_PAGE_SIZE, total: 0 };

function displayText(value: unknown, fallback = "No disponible") {
  return typeof value === "string" && value ? value : fallback;
}

function displayCount(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("es-CL") : "0";
}

function displayDate(value: unknown) {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split("-").reverse().join("-") : "No disponible";
}

function lifecycleLabel(value: string | null) {
  if (value === "NEW") return "Nuevo";
  if (value === "FREQUENT") return "Frecuente";
  return "No disponible";
}

function packLabel(value: string | null) {
  if (value === "PACK") return "Pack";
  if (value === "NO_PACK") return "Boleta";
  return "No disponible";
}

function tierTone(value: string | null): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    BRONZE: "warning",
    DIAMOND: "success",
    GOLD: "warning",
    IRON: "neutral",
    PLATINUM: "info",
    SILVER: "neutral",
  };
  return value ? tones[value] ?? "neutral" : "neutral";
}

function TierBadge({ value }: { value: string | null }) {
  return <ValueBadge tone={tierTone(value)}>{formatCustomerTierLabel(value)}</ValueBadge>;
}

function lifecycleTone(value: string | null): BadgeTone {
  return value === "FREQUENT" ? "success" : value === "NEW" ? "info" : "neutral";
}

function behaviorTone(value: string | null): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    ALTERNATING: "warning",
    MIGRATED_TO_MCP_EAP: "success",
    MIGRATED_TO_OKP: "danger",
    ONLY_MCP_EAP: "success",
    ONLY_OKP: "info",
  };
  return value ? tones[value] ?? "neutral" : "neutral";
}

function behaviorLabel(value: string | null) {
  const labels: Record<string, string> = {
    ALTERNATING: "Alternante",
    MIGRATED_TO_MCP_EAP: "Migró a MCP/EAP",
    MIGRATED_TO_OKP: "Migró a OKP",
    ONLY_MCP_EAP: "Solo MCP/EAP",
    ONLY_OKP: "Solo OKP",
  };
  return value ? labels[value] ?? value : "No disponible";
}

async function getJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No fue posible completar la consulta.");
  return body;
}

function criterionNumber(criteria: ClassificationCriteria, group: string, key: string) {
  const record = criteria[group];
  if (!record || typeof record !== "object" || Array.isArray(record)) return "-";
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" ? value.toLocaleString("es-CL") : "-";
}

function ClassificationCriteriaContent({ criteria }: { criteria: ClassificationCriteria }) {
  const resetYears = criterionNumber(criteria, "lifecycle", "resetYears");
  const migrationCount = criterionNumber(criteria, "brandBehavior", "migrationRecentReservations");

  return (
    <div className="mt-4 grid gap-5 border-t border-[#e4edf4] pt-4 lg:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold text-navy">Nuevo / Frecuente</h3>
        <p className="mt-1 text-sm text-slate-600">Nuevo: primera compra o retorno después de {resetYears} años. Frecuente: actividad recurrente sin ese reinicio.</p>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-navy">Pack / No Pack</h3>
        <p className="mt-1 text-sm text-slate-600">Pack: registra al menos una compra histórica de pack. No Pack: no registra compras históricas de pack.</p>
      </section>
      <section className="lg:col-span-2">
        <h3 className="text-sm font-semibold text-navy">Tier</h3>
        <dl className="mt-2 grid gap-x-5 gap-y-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
          <div><dt className="font-semibold text-navy">Iron</dt><dd>Una compra histórica.</dd></div>
          <div><dt className="font-semibold text-navy">Bronze</dt><dd>Cliente repetidor que no alcanza Silver.</dd></div>
          <div><dt className="font-semibold text-navy">Silver</dt><dd>{criterionNumber(criteria, "tier", "silver_reservations_12m")} compras en 12 meses o {criterionNumber(criteria, "tier", "silver_reservations_24m")} en 24 meses.</dd></div>
          <div><dt className="font-semibold text-navy">Gold</dt><dd>{criterionNumber(criteria, "tier", "gold_reservations_12m")} compras en 12 meses, o {criterionNumber(criteria, "tier", "gold_historical_reservations")} históricas con {criterionNumber(criteria, "tier", "gold_reservations_24m")} en 24 meses y brecha mediana máxima de {criterionNumber(criteria, "tier", "gold_median_gap_days")} días.</dd></div>
          <div><dt className="font-semibold text-navy">Platinum</dt><dd>{criterionNumber(criteria, "tier", "platinum_reservations_12m")} compras en 12 meses, o {criterionNumber(criteria, "tier", "platinum_cadence_reservations_12m")} con brecha mediana máxima de {criterionNumber(criteria, "tier", "platinum_median_gap_days")} días.</dd></div>
          <div><dt className="font-semibold text-navy">Diamond</dt><dd>{criterionNumber(criteria, "tier", "diamond_reservations_12m")} compras en 12 meses, o {criterionNumber(criteria, "tier", "diamond_cadence_reservations_12m")} con brecha mediana máxima de {criterionNumber(criteria, "tier", "diamond_median_gap_days")} días.</dd></div>
        </dl>
      </section>
      <section className="lg:col-span-2">
        <h3 className="text-sm font-semibold text-navy">Comportamiento entre marcas</h3>
        <p className="mt-1 text-sm text-slate-600">Distingue clientes exclusivos, alternantes y migraciones según sus últimas {migrationCount} compras confirmadas.</p>
      </section>
    </div>
  );
}

function CustomerIdentity({ customer }: { customer: PeriodCustomer }) {
  const email = customer.emails[0];
  const phone = customer.phones[0];
  const primary = email ?? phone ?? "Identidad no disponible";
  const secondary = email && phone ? phone : null;

  return (
    <div className="min-w-0 overflow-hidden">
      <p className="truncate text-xs font-medium leading-5 text-navy" title={primary}>{primary}</p>
      {secondary ? <p className="mt-0.5 truncate text-[11px] font-normal leading-4 text-slate-500" title={secondary}>{secondary}</p> : null}
    </div>
  );
}

function CustomerPeriodSelector({ onApply, preset, range }: {
  onApply: (preset: CustomerPeriodPreset, range: CustomerPeriodRange) => void;
  preset: CustomerPeriodPreset;
  range: CustomerPeriodRange;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMode, setCustomMode] = useState<CustomPeriodMode>(range.from === range.to ? "single" : "range");
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverId = "customer-window-period-popover";
  const selectedLabel = periodOptions.find((option) => option.value === preset)?.label ?? "Personalizado";

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function openCustomPanel() {
    setCustomMode(range.from === range.to ? "single" : "range");
    setCustomFrom(range.from);
    setCustomTo(range.to);
    setCustomError(null);
    setIsOpen(true);
  }

  function selectPreset(nextPreset: CustomerPeriodPreset) {
    if (nextPreset === "custom") {
      openCustomPanel();
      return;
    }

    onApply(nextPreset, getCustomerPeriodRange(nextPreset, getSantiagoDateKey()));
    setCustomError(null);
    setIsOpen(false);
  }

  function selectCustomMode(mode: CustomPeriodMode) {
    setCustomMode(mode);
    setCustomError(null);
    if (mode === "single") setCustomTo(customFrom);
    else setCustomTo((current) => current || customFrom);
  }

  function applyCustomPeriod() {
    const nextRange = customMode === "single"
      ? { from: customFrom, to: customFrom }
      : { from: customFrom, to: customTo };
    if (!isValidCustomerPeriodRange(nextRange)) {
      setCustomError("La fecha desde debe ser anterior o igual a la fecha hasta.");
      return;
    }

    setCustomError(null);
    setIsOpen(false);
    onApply("custom", nextRange);
  }

  return (
    <div className="relative grid min-w-0 gap-3 text-sm font-medium text-navy sm:grid-cols-[minmax(180px,220px)_auto] sm:items-end" ref={rootRef}>
      <div className="grid min-w-0 gap-1">
        <span>Periodo</span>
        <button aria-controls={popoverId} aria-expanded={isOpen} aria-haspopup="dialog" className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#cbd8e3] bg-white px-3 text-left text-sm text-navy outline-none transition hover:bg-[#f8fbfd] focus:border-sea focus:ring-2 focus:ring-[#9bcbdc]/40" onClick={() => {
          if (!isOpen && preset === "custom") {
            openCustomPanel();
            return;
          }
          setIsOpen((current) => !current);
        }} type="button">
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>
      <div className="grid min-w-0 gap-1">
        <span>Rango seleccionado</span>
        <p className="flex h-10 min-w-0 items-center text-sm font-normal text-slate-500 sm:whitespace-nowrap">{displayDate(range.from)} <span className="px-1.5" aria-hidden="true">→</span> {displayDate(range.to)}</p>
      </div>

      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[calc(100vw-2rem)] max-w-[34rem] overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-xl" id={popoverId}>
          <div className="grid max-h-[min(80vh,32rem)] overflow-y-auto overflow-x-hidden md:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="border-b border-[#e4edf4] p-2 md:border-b-0 md:border-r">
              {periodOptions.map((option) => <button className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${preset === option.value ? "bg-[#e8f4f8] font-semibold text-navy" : "text-slate-600 hover:bg-[#f8fbfd]"}`} key={option.value} onClick={() => selectPreset(option.value)} type="button">{option.label}</button>)}
            </div>
            <div className="grid min-w-0 gap-3 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Personalizado</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f1f6f9] p-1" aria-label="Modo de periodo personalizado">
                <button aria-pressed={customMode === "single"} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${customMode === "single" ? "bg-white text-navy shadow-sm" : "text-slate-600 hover:text-navy"}`} onClick={() => selectCustomMode("single")} type="button">Un día</button>
                <button aria-pressed={customMode === "range"} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${customMode === "range" ? "bg-white text-navy shadow-sm" : "text-slate-600 hover:text-navy"}`} onClick={() => selectCustomMode("range")} type="button">Rango de fechas</button>
              </div>
              {customMode === "single" ? (
                <label className="grid gap-1 text-sm font-medium text-navy">Fecha<input className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm" onChange={(event) => { setCustomFrom(event.target.value); setCustomTo(event.target.value); }} type="date" value={customFrom} /></label>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-navy">Desde<input className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm" onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} /></label><label className="grid gap-1 text-sm font-medium text-navy">Hasta<input className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm" onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} /></label></div>
              )}
              {customError ? <p className="text-sm text-red-700" role="alert">{customError}</p> : null}
              <button className="h-10 justify-self-start rounded-lg bg-navy px-4 text-sm font-semibold text-white" onClick={applyCustomPeriod} type="button">Aplicar</button>
              <p className="text-xs font-normal text-slate-500">Fecha de compra · America/Santiago</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomerFilterPopover({ activeCount, filters, onChange }: {
  activeCount: number;
  filters: CustomerFilters;
  onChange: (filter: CustomerFilterKey, value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverId = "customer-window-filter-popover";

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={rootRef}>
      <button aria-controls={popoverId} aria-expanded={isOpen} aria-haspopup="dialog" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-semibold text-navy transition hover:border-sea hover:bg-[#f8fbfd] focus:outline-none focus:ring-2 focus:ring-[#9bcbdc]/40 sm:w-auto" onClick={() => setIsOpen((current) => !current)} type="button">
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        {activeCount > 0 ? `Filtros (${activeCount})` : "Filtros"}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(calc(100vw-2rem),32rem)] rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-xl sm:left-auto sm:right-0" id={popoverId}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-navy">Nuevo / Frecuente<select className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3" onChange={(event) => onChange("lifecycleStatus", event.target.value)} value={filters.lifecycleStatus}><option value="">Todos</option><option value="NEW">Nuevo</option><option value="FREQUENT">Frecuente</option></select></label>
            <label className="grid gap-1 text-sm font-medium text-navy">Tier<select className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3" onChange={(event) => onChange("tier", event.target.value)} value={filters.tier}><option value="">Todos</option>{["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"].map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium text-navy">Pack / No Pack<select className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3" onChange={(event) => onChange("packStatus", event.target.value)} value={filters.packStatus}><option value="">Todos</option><option value="PACK">Pack</option><option value="NO_PACK">No Pack</option></select></label>
            <label className="grid gap-1 text-sm font-medium text-navy">Comportamiento<select className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3" onChange={(event) => onChange("brandBehavior", event.target.value)} value={filters.brandBehavior}><option value="">Todos</option><option value="ONLY_MCP_EAP">Solo MCP/EAP</option><option value="ONLY_OKP">Solo OKP</option><option value="MIGRATED_TO_MCP_EAP">Migró a MCP/EAP</option><option value="MIGRATED_TO_OKP">Migró a OKP</option><option value="ALTERNATING">Alternante</option></select></label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomerMetricSplit({ both, label, mcpEapOnly, okpOnly, tone, total, universe }: {
  both: number;
  label: string;
  mcpEapOnly: number;
  okpOnly: number;
  tone: BadgeTone;
  total: number;
  universe: number;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f8fafb] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <ValueBadge tone={tone}>{label}</ValueBadge>
        <span className="text-lg font-semibold leading-none text-navy">{displayCount(total)}</span>
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-500">{formatCustomerMetricPercentage(total, universe)} del período</p>
      <dl className="mt-2 grid gap-1 border-t border-[#e4edf4] pt-2 text-[11px]">
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Solo MCP/EAP</dt><dd className="font-medium text-navy">{displayCount(mcpEapOnly)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Solo OKP</dt><dd className="font-medium text-navy">{displayCount(okpOnly)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Ambos</dt><dd className="font-medium text-navy">{displayCount(both)}</dd></div>
      </dl>
    </div>
  );
}

function CustomerCommercialMetrics({ error, loading, metrics }: {
  error: string | null;
  loading: boolean;
  metrics: CustomerPeriodMetrics | null;
}) {
  const behaviorRows = metrics ? [
    { label: "Solo MCP/EAP", value: metrics.onlyMcpEapCustomers },
    { label: "Solo OKP", value: metrics.onlyOkpCustomers },
    { label: "Migró a MCP/EAP", value: metrics.migratedToMcpEapCustomers },
    { label: "Migró a OKP", value: metrics.migratedToOkpCustomers },
    { label: "Alternante", value: metrics.alternatingCustomers },
  ] : [];

  return (
    <section aria-label="Resumen comercial del período" className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      {loading && !metrics ? <div className="grid animate-pulse gap-px bg-[#e4edf4] sm:grid-cols-3"><div className="h-24 bg-white" /><div className="h-24 bg-white" /><div className="h-24 bg-white" /></div> : null}
      {error ? <p className="px-4 py-3 text-xs text-red-700" role="alert">No fue posible cargar el resumen comercial. Las tablas siguen disponibles.</p> : null}
      {metrics ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <div className="grid divide-y divide-[#e4edf4] lg:grid-cols-[0.65fr_1.35fr_1.35fr] lg:divide-x lg:divide-y-0">
            <div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Clientes</p><p className="mt-1 text-2xl font-semibold leading-none text-navy">{displayCount(metrics.totalCustomers)}</p><p className="mt-1 text-[11px] text-slate-500">Perfiles únicos del período</p></div>
            <div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Nuevos / Frecuentes</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><CustomerMetricSplit both={metrics.newBothCustomers} label="Nuevos" mcpEapOnly={metrics.newMcpEapOnlyCustomers} okpOnly={metrics.newOkpOnlyCustomers} tone="info" total={metrics.newCustomers} universe={metrics.totalCustomers} /><CustomerMetricSplit both={metrics.frequentBothCustomers} label="Frecuentes" mcpEapOnly={metrics.frequentMcpEapOnlyCustomers} okpOnly={metrics.frequentOkpOnlyCustomers} tone="success" total={metrics.frequentCustomers} universe={metrics.totalCustomers} /></div></div>
            <div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Pack / Boleta</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><CustomerMetricSplit both={metrics.packBothCustomers} label="Pack" mcpEapOnly={metrics.packMcpEapOnlyCustomers} okpOnly={metrics.packOkpOnlyCustomers} tone="success" total={metrics.packCustomers} universe={metrics.totalCustomers} /><CustomerMetricSplit both={metrics.nonPackBothCustomers} label="Boleta" mcpEapOnly={metrics.nonPackMcpEapOnlyCustomers} okpOnly={metrics.nonPackOkpOnlyCustomers} tone="neutral" total={metrics.nonPackCustomers} universe={metrics.totalCustomers} /></div></div>
          </div>
          <div className="border-t border-[#e4edf4] px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Comportamiento</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{behaviorRows.map((item) => <div className="min-w-0 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-2.5" key={item.label}><p className="truncate text-[11px] font-medium text-slate-600" title={item.label}>{item.label}</p><p className="mt-1 text-xl font-semibold leading-none text-navy">{displayCount(item.value)}</p><p className="mt-1 text-[11px] text-slate-500">{formatCustomerMetricPercentage(item.value, metrics.totalCustomers)} del período</p></div>)}</div></div>
        </div>
      ) : null}
    </section>
  );
}

function CustomerPeriodTable({ error, family, list, loading, onPageChange, onSelectCustomer }: {
  error: string | null;
  family: CustomerFamily;
  list: PeriodList;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSelectCustomer: (customer: PeriodCustomer) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(list.total / PERIOD_PAGE_SIZE));
  const isOkp = family === "OKP";

  return (
    <Panel count={`${list.total.toLocaleString("es-CL")} clientes`} title={isOkp ? "Clientes OKP" : "Clientes MCP / EAP"}>
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">Cargando clientes...</p> : null}
      {!loading && !error && list.items.length === 0 ? <div className="mt-4"><EmptyState description="No hay clientes con compras para este período y filtros." /></div> : null}
      {list.items.length > 0 ? (
        <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <div className="max-h-[640px] overflow-y-auto overscroll-contain rounded-xl">
            <DataTable minWidth="0px">
              <colgroup><col className="w-[34%]" /><col className="w-[22%]" /><col className="w-[16%]" /><col className="w-[28%]" /></colgroup>
              <DataTableHead><tr>{["Cliente", "Tipo cliente", "Qty", "Perfil comercial"].map((label) => <th className="border-b border-[#d6e1ea] px-3 py-2 text-left text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-slate-500" key={label}>{label}</th>)}</tr></DataTableHead>
              <DataTableBody>
                {list.items.map((customer) => (
                <tr
                  aria-label={`Abrir cliente ${customer.emails[0] ?? customer.phones[0] ?? "sin identidad visible"}`}
                  className="cursor-pointer transition odd:bg-white even:bg-[#fbfcfd] hover:bg-[#eef7fb] focus:bg-[#eef7fb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sea/30"
                  key={customer.customerId}
                  onClick={() => onSelectCustomer(customer)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCustomer(customer);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="max-w-0 overflow-hidden px-3 py-2 align-middle text-slate-700"><CustomerIdentity customer={customer} /></td>
                  <td className="max-w-0 px-3 py-2 align-middle"><div className="flex flex-wrap items-center gap-1"><ValueBadge tone={lifecycleTone(customer.lifecycleStatus)}>{lifecycleLabel(customer.lifecycleStatus)}</ValueBadge><TierBadge value={customer.tier} /></div></td>
                  <td className="max-w-0 px-3 py-2 align-middle text-xs font-normal leading-5 text-slate-700">{displayCount(customer.totalReservations)}</td>
                  <td className="max-w-0 px-3 py-2 align-middle"><div className="min-w-0"><ValueBadge tone={behaviorTone(customer.brandBehavior)}>{behaviorLabel(customer.brandBehavior)}</ValueBadge><p className="mt-0.5 truncate text-[11px] font-normal leading-4 text-slate-500">{packLabel(customer.packStatus)}</p></div></td>
                </tr>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || list.page <= 1} onClick={() => onPageChange(list.page - 1)} type="button">Anterior</button><span className="text-sm text-slate-600">Página {list.page} de {pageCount}</span><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || list.page >= pageCount} onClick={() => onPageChange(list.page + 1)} type="button">Siguiente</button></div>
        </div>
      ) : null}
    </Panel>
  );
}

function CustomerDetailDrawer({
  customer,
  customerId,
  error,
  loading,
  onClose,
  onPageChange,
  summary,
  timeline,
  timelinePage,
}: {
  customer: PeriodCustomer | null;
  customerId: string | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onPageChange: (page: number) => void;
  summary: CustomerSummary | null;
  timeline: Timeline | null;
  timelinePage: number;
}) {
  const timelinePageCount = Math.max(1, Math.ceil((timeline?.total ?? 0) / TIMELINE_PAGE_SIZE));

  if (!customerId) return null;

  const primaryIdentity = customer?.emails[0] ?? customer?.phones[0] ?? "Cliente seleccionado";
  const secondaryIdentity = customer?.emails[0] && customer?.phones[0] ? customer.phones[0] : null;

  return (
    <div aria-labelledby="customer-window-detail-title" aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-navy/35" role="dialog">
      <button aria-label="Cerrar detalle del cliente" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} type="button" />
      <aside className="relative flex h-full w-full max-w-full flex-col overflow-y-auto overflow-x-hidden bg-white shadow-2xl md:max-w-2xl">
        <header className="sticky top-0 z-10 border-b border-[#d6e1ea] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-sea">Detalle del cliente</p>
              <h2 className="mt-2 break-all text-xl font-semibold text-navy" id="customer-window-detail-title">{primaryIdentity}</h2>
              {secondaryIdentity ? <p className="mt-1 break-words text-sm text-slate-600">{secondaryIdentity}</p> : null}
            </div>
            <button aria-label="Cerrar detalle del cliente" className="rounded-lg border border-[#d7e3ec] p-2 text-navy transition hover:bg-[#f3f9fc] focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={onClose} title="Cerrar" type="button"><X className="h-5 w-5" /></button>
          </div>
          {customer ? <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium text-navy">{lifecycleLabel(customer.lifecycleStatus)}</span><TierBadge value={customer.tier} /><span className="rounded bg-[#eef5f8] px-2 py-1 text-xs font-medium text-navy">{behaviorLabel(customer.brandBehavior)}</span></div> : null}
        </header>

        <div className="grid gap-5 p-5">
          {loading && !summary ? <p className="text-sm text-slate-600">Cargando detalle...</p> : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          {summary?.ok ? (
            <section>
              <h3 className="text-sm font-semibold uppercase text-slate-500">Resumen</h3>
              <dl className="mt-3 grid gap-x-4 gap-y-3 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 sm:grid-cols-2 lg:grid-cols-3">
                {[["Primera compra", displayDate(summary.firstPurchaseAt)], ["Última compra", displayDate(summary.lastPurchaseAt)], ["Reservas históricas", displayCount(summary.purchaseCount)], ["Reservas futuras", displayCount(summary.futureBookingCount)], ["Packs / Boletas", `${displayCount(summary.packCount)} / ${displayCount(summary.nonPackCount)}`]].map(([label, value]) => <div className="min-w-0" key={label as string}><dt className="text-[11px] font-medium uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-navy">{value}</dd></div>)}
                <div className="min-w-0"><dt className="text-[11px] font-medium uppercase text-slate-500">Comportamiento</dt><dd className="mt-1"><ValueBadge tone={behaviorTone(customer?.brandBehavior ?? null)}>{behaviorLabel(customer?.brandBehavior ?? null)}</ValueBadge></dd></div>
              </dl>
              {summary.needsReview === true ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800" role="status">Requiere revisión</p> : null}
            </section>
          ) : null}

          {summary?.ok ? (
            <details className="rounded-lg border border-[#e4edf4] bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-navy outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sea/30 [&::-webkit-details-marker]:hidden">Más información</summary>
              <dl className="grid gap-x-4 gap-y-3 border-t border-[#e4edf4] px-4 py-3 sm:grid-cols-2">
                {[["MCP", displayCount(summary.mcpCount)], ["EAP", displayCount(summary.eapCount)], ["OKP", displayCount(summary.okpCount)], ["Última marca", displayText(summary.lastBrand)], ["Último parking", displayText(summary.lastParking)], ["Teléfonos conocidos", displayCount(summary.knownPhonesCount)], ["Emails conocidos", displayCount(summary.knownEmailsCount)], ["Patentes conocidas", displayCount(summary.knownPlatesCount)]].map(([label, value]) => <div className="min-w-0" key={label as string}><dt className="text-[11px] font-medium uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-normal text-navy">{value}</dd></div>)}
              </dl>
            </details>
          ) : null}

          {summary?.ok ? (
            <section>
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold uppercase text-slate-500">Historial de compras</h3><span className="text-xs text-slate-500">{timeline?.total ?? 0} registros</span></div>
              {(timeline?.items ?? []).length ? (
                <ol className="relative mt-4 before:absolute before:bottom-0 before:left-[9px] before:top-0 before:w-px before:bg-[#cbd8e3] sm:before:left-1/2">
                  {(timeline?.items ?? []).map((booking) => {
                    const isOkpBooking = booking.source === "OKP";
                    const familyLabel = isOkpBooking ? "OKP" : displayText(booking.brand, "MCP/EAP");
                    return (
                      <li className="relative grid grid-cols-[20px_minmax(0,1fr)] pb-5 last:pb-0 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]" key={`${booking.source}-${booking.source_row_id}`}>
                        <span className="relative z-[1] col-start-1 row-start-1 mt-4 h-3 w-3 justify-self-center rounded-full border-2 border-white bg-sea ring-1 ring-[#9ec8d8] sm:col-start-2" />
                        <details className={`group col-start-2 row-start-1 min-w-0 rounded-xl border border-[#d6e1ea] bg-white p-3 shadow-[0_5px_14px_rgba(2,53,116,0.04)] transition hover:border-sea/50 open:border-sea/50 ${isOkpBooking ? "sm:col-start-3 sm:ml-1" : "sm:col-start-1 sm:mr-1"}`}>
                          <summary className={`cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-sea/30 [&::-webkit-details-marker]:hidden ${isOkpBooking ? "" : "sm:text-right"}`}>
                            <div className={`flex flex-wrap items-start gap-2 ${isOkpBooking ? "justify-between" : "justify-between sm:flex-row-reverse"}`}><div><p className="text-sm font-semibold text-navy">{displayDate(booking.purchase_created_at)}</p><p className="mt-0.5 break-all text-xs text-slate-500">{familyLabel} · {displayText(booking.source_booking_code)}</p></div><ValueBadge tone={booking.is_pack ? "success" : "neutral"}>{booking.is_pack ? "Pack" : "Boleta"}</ValueBadge></div>
                          </summary>
                          <dl className={`mt-3 grid gap-2 border-t border-[#edf2f6] pt-3 text-sm ${isOkpBooking ? "" : "sm:text-right"}`}><div><dt className="text-xs text-slate-500">Parking</dt><dd className="break-words font-medium text-navy">{displayText(booking.parking)}</dd></div><div><dt className="text-xs text-slate-500">Estado</dt><dd className="font-medium text-navy">{displayText(booking.status)}</dd></div><div><dt className="text-xs text-slate-500">Llegada / salida</dt><dd className="font-medium text-navy">{displayDate(booking.planned_arrival_at)} · {displayDate(booking.planned_departure_at)}</dd></div><div><dt className="text-xs text-slate-500">Duración</dt><dd className="font-medium text-navy">{booking.duration_days === null ? "No disponible" : `${displayCount(booking.duration_days)} días`}</dd></div></dl>
                        </details>
                      </li>
                    );
                  })}
                </ol>
              ) : loading ? null : <div className="mt-4"><EmptyState description="Este cliente no tiene compras confirmadas para mostrar." /></div>}
              <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || timelinePage <= 1} onClick={() => onPageChange(timelinePage - 1)} type="button">Anterior</button><span className="text-sm text-slate-600">Página {timelinePage} de {timelinePageCount}</span><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || timelinePage >= timelinePageCount} onClick={() => onPageChange(timelinePage + 1)} type="button">Siguiente</button></div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function CustomerWindowView() {
  const initialRange = useRef(getCustomerPeriodRange("today", getSantiagoDateKey()));
  const [section, setSection] = useState<"clientes" | "campanas">("clientes");
  const [periodPreset, setPeriodPreset] = useState<CustomerPeriodPreset>("today");
  const [periodRange, setPeriodRange] = useState<CustomerPeriodRange>(initialRange.current);
  const [lifecycleStatus, setLifecycleStatus] = useState("");
  const [tier, setTier] = useState("");
  const [packStatus, setPackStatus] = useState("");
  const [brandBehavior, setBrandBehavior] = useState("");
  const [mcpPage, setMcpPage] = useState(1);
  const [okpPage, setOkpPage] = useState(1);
  const [mcpList, setMcpList] = useState<PeriodList>(emptyPeriodList);
  const [okpList, setOkpList] = useState<PeriodList>(emptyPeriodList);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [okpLoading, setOkpLoading] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [okpError, setOkpError] = useState<string | null>(null);
  const requestControllers = useRef<Record<CustomerFamily, AbortController | null>>({ MCP_EAP: null, OKP: null });
  const periodMetricsController = useRef<AbortController | null>(null);
  const [periodMetrics, setPeriodMetrics] = useState<CustomerPeriodMetrics | null>(null);
  const [periodMetricsLoading, setPeriodMetricsLoading] = useState(false);
  const [periodMetricsError, setPeriodMetricsError] = useState<string | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteria, setCriteria] = useState<ClassificationCriteria | null>(null);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [drawerCustomerId, setDrawerCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<PeriodCustomer | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFamily = useCallback(async (family: CustomerFamily, page: number) => {
    requestControllers.current[family]?.abort();
    const controller = new AbortController();
    requestControllers.current[family] = controller;
    const setFamilyLoading = family === "MCP_EAP" ? setMcpLoading : setOkpLoading;
    const setFamilyError = family === "MCP_EAP" ? setMcpError : setOkpError;
    const setFamilyList = family === "MCP_EAP" ? setMcpList : setOkpList;
    const params = new URLSearchParams({ action: "list-by-period", family, from: periodRange.from, page: String(page), pageSize: String(PERIOD_PAGE_SIZE), to: periodRange.to });
    if (lifecycleStatus) params.set("lifecycleStatus", lifecycleStatus);
    if (tier) params.set("tier", tier);
    if (packStatus) params.set("packStatus", packStatus);
    if (brandBehavior) params.set("brandBehavior", brandBehavior);
    setFamilyLoading(true);
    setFamilyError(null);
    try {
      const body = await getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal);
      if (requestControllers.current[family] !== controller) return;
      setFamilyList({ items: Array.isArray(body.items) ? body.items : [], page: typeof body.page === "number" ? body.page : page, pageSize: typeof body.pageSize === "number" ? body.pageSize : PERIOD_PAGE_SIZE, total: typeof body.total === "number" ? body.total : 0 });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestControllers.current[family] === controller) setFamilyError(cause instanceof Error ? cause.message : "No fue posible cargar clientes.");
    } finally {
      if (requestControllers.current[family] === controller) setFamilyLoading(false);
    }
  }, [brandBehavior, lifecycleStatus, packStatus, periodRange.from, periodRange.to, tier]);

  const loadPeriodMetrics = useCallback(async () => {
    periodMetricsController.current?.abort();
    const controller = new AbortController();
    periodMetricsController.current = controller;
    const params = new URLSearchParams({ action: "period-metrics", from: periodRange.from, to: periodRange.to });
    if (lifecycleStatus) params.set("lifecycleStatus", lifecycleStatus);
    if (tier) params.set("tier", tier);
    if (packStatus) params.set("packStatus", packStatus);
    if (brandBehavior) params.set("brandBehavior", brandBehavior);
    setPeriodMetricsLoading(true);
    setPeriodMetricsError(null);
    try {
      const body = await getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal);
      if (periodMetricsController.current !== controller) return;
      const nextMetrics = normalizeCustomerPeriodMetrics(body);
      if (!nextMetrics) throw new Error("Respuesta de métricas inválida.");
      setPeriodMetrics(nextMetrics);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (periodMetricsController.current === controller) {
        setPeriodMetricsError(cause instanceof Error ? cause.message : "No fue posible cargar el resumen comercial.");
      }
    } finally {
      if (periodMetricsController.current === controller) setPeriodMetricsLoading(false);
    }
  }, [brandBehavior, lifecycleStatus, packStatus, periodRange.from, periodRange.to, tier]);

  const closeCustomerDrawer = useCallback(() => {
    setDrawerCustomerId(null);
    setSelectedCustomer(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (section !== "clientes") return;
    void loadFamily("MCP_EAP", mcpPage);
    const controller = requestControllers.current.MCP_EAP;
    return () => controller?.abort();
  }, [loadFamily, mcpPage, section]);

  useEffect(() => {
    if (section !== "clientes") return;
    void loadFamily("OKP", okpPage);
    const controller = requestControllers.current.OKP;
    return () => controller?.abort();
  }, [loadFamily, okpPage, section]);

  useEffect(() => {
    if (section !== "clientes") return;
    void loadPeriodMetrics();
    const controller = periodMetricsController.current;
    return () => controller?.abort();
  }, [loadPeriodMetrics, section]);

  useEffect(() => {
    if (!drawerCustomerId) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCustomerDrawer();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeCustomerDrawer, drawerCustomerId]);

  function resetFamilyPages() { setMcpPage(1); setOkpPage(1); }

  function abortFamilyRequests() {
    requestControllers.current.MCP_EAP?.abort();
    requestControllers.current.OKP?.abort();
    periodMetricsController.current?.abort();
    setPeriodMetrics(null);
    setPeriodMetricsError(null);
  }

  function applyPeriod(preset: CustomerPeriodPreset, range: CustomerPeriodRange) {
    abortFamilyRequests();
    setPeriodPreset(preset);
    setPeriodRange(range);
    resetFamilyPages();
  }

  function updateFilter(filter: CustomerFilterKey, value: string) {
    abortFamilyRequests();
    if (filter === "lifecycleStatus") setLifecycleStatus(value);
    if (filter === "tier") setTier(value);
    if (filter === "packStatus") setPackStatus(value);
    if (filter === "brandBehavior") setBrandBehavior(value);
    resetFamilyPages();
  }

  function clearFilters() {
    abortFamilyRequests();
    setLifecycleStatus("");
    setTier("");
    setPackStatus("");
    setBrandBehavior("");
    resetFamilyPages();
  }

  async function toggleCriteria() {
    const nextOpen = !criteriaOpen;
    setCriteriaOpen(nextOpen);
    if (!nextOpen || criteria || criteriaLoading) return;
    setCriteriaLoading(true);
    setCriteriaError(null);
    try {
      const body = await getJson("/api/orquestador/customer-window/customers?action=criteria");
      setCriteria(body && typeof body === "object" && !Array.isArray(body) ? body : {});
    } catch (cause) {
      setCriteriaError(cause instanceof Error ? cause.message : "No fue posible cargar los criterios.");
    } finally { setCriteriaLoading(false); }
  }

  async function selectCustomer(customerId: string, customer: PeriodCustomer | null = null) {
    setDrawerCustomerId(customerId); setSelectedCustomer(customer);
    setLoading(true); setError(null); setSummary(null); setTimeline(null); setTimelinePage(1);
    try {
      const [nextSummary, nextTimeline] = await Promise.all([
        getJson(`/api/orquestador/customer-window/customers?action=summary&customerId=${customerId}`),
        getJson(`/api/orquestador/customer-window/customers?action=bookings&customerId=${customerId}&page=1&pageSize=${TIMELINE_PAGE_SIZE}`),
      ]);
      setSummary(nextSummary); setTimeline(nextTimeline);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar el cliente."); }
    finally { setLoading(false); }
  }

  async function changeTimelinePage(nextPage: number) {
    if (!summary) return;
    setLoading(true); setError(null);
    try {
      const nextTimeline = await getJson(`/api/orquestador/customer-window/customers?action=bookings&customerId=${summary.customerId}&page=${nextPage}&pageSize=${TIMELINE_PAGE_SIZE}`);
      setTimeline(nextTimeline); setTimelinePage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar el historial."); }
    finally { setLoading(false); }
  }

  const filters: CustomerFilters = { brandBehavior, lifecycleStatus, packStatus, tier };
  const activeFilters = [
    lifecycleStatus ? { key: "lifecycleStatus" as const, label: lifecycleLabel(lifecycleStatus) } : null,
    tier ? { key: "tier" as const, label: formatCustomerTierLabel(tier) } : null,
    packStatus ? { key: "packStatus" as const, label: packLabel(packStatus) } : null,
    brandBehavior ? { key: "brandBehavior" as const, label: behaviorLabel(brandBehavior) } : null,
  ].filter((filter): filter is { key: CustomerFilterKey; label: string } => filter !== null);

  return (
    <section className="mt-5">
      <div className="flex gap-2 border-b border-[#d6e1ea]" role="tablist" aria-label="Customer Window">{(["clientes", "campanas"] as const).map((value) => <button aria-selected={section === value} className={`border-b-2 px-4 py-3 text-sm font-semibold ${section === value ? "border-sea text-navy" : "border-transparent text-slate-500"}`} key={value} onClick={() => setSection(value)} role="tab" type="button">{value === "clientes" ? "Clientes" : "Campañas"}</button>)}</div>
      {section === "campanas" ? <Panel title="Campañas"><p className="mt-4 text-sm text-slate-600">Próximamente.</p></Panel> : (
        <>
          <section aria-label="Filtros de clientes" className="relative z-20 mt-5 overflow-visible rounded-xl border border-[#d6e1ea] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <CustomerPeriodSelector onApply={applyPeriod} preset={periodPreset} range={periodRange} />
              <CustomerFilterPopover activeCount={activeFilters.length} filters={filters} onChange={updateFilter} />
            </div>
            {activeFilters.length > 0 ? <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros activos">{activeFilters.map((filter) => <button aria-label={`Quitar filtro ${filter.label}`} className="inline-flex items-center gap-1 rounded-full border border-[#cbd8e3] bg-[#f3f6f8] px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-sea" key={filter.key} onClick={() => updateFilter(filter.key, "")} type="button">{filter.label}<X aria-hidden="true" className="h-3 w-3" /></button>)}<button className="px-1 py-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-navy hover:underline" onClick={clearFilters} type="button">Limpiar filtros</button></div> : null}
          </section>
          <CustomerCommercialMetrics error={periodMetricsError} loading={periodMetricsLoading} metrics={periodMetrics} />
          <div className="grid items-stretch gap-5 xl:grid-cols-2">
            <CustomerPeriodTable error={mcpError} family="MCP_EAP" list={mcpList} loading={mcpLoading} onPageChange={setMcpPage} onSelectCustomer={(customer) => void selectCustomer(customer.customerId, customer)} />
            <CustomerPeriodTable error={okpError} family="OKP" list={okpList} loading={okpLoading} onPageChange={setOkpPage} onSelectCustomer={(customer) => void selectCustomer(customer.customerId, customer)} />
          </div>
          <Panel action={<button aria-controls="customer-window-classification-criteria" aria-expanded={criteriaOpen} className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold text-navy hover:border-sea" onClick={toggleCriteria} type="button">{criteriaOpen ? "Ocultar" : "Mostrar"}{criteriaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>} description="Consulta las reglas oficiales utilizadas por el modelo comercial." title="Criterios de clasificación"><div id="customer-window-classification-criteria">{criteriaOpen && criteriaLoading ? <p className="mt-4 text-sm text-slate-600">Cargando criterios...</p> : null}{criteriaOpen && criteriaError ? <p className="mt-4 text-sm text-red-700" role="alert">{criteriaError}</p> : null}{criteriaOpen && criteria ? <ClassificationCriteriaContent criteria={criteria} /> : null}</div></Panel>
        </>
      )}
      <CustomerDetailDrawer customer={selectedCustomer} customerId={drawerCustomerId} error={error} loading={loading} onClose={closeCustomerDrawer} onPageChange={changeTimelinePage} summary={summary} timeline={timeline} timelinePage={timelinePage} />
    </section>
  );
}
