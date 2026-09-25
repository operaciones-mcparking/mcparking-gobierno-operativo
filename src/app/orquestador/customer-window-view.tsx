"use client";

import { CheckCircle2, ChevronDown, ChevronLeft, ChevronUp, Clock3, Info, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
  formatCustomerTierLabel,
} from "@/lib/customer-window/customer-period-metrics";
import {
  CUSTOMER_IDENTITY_DECISION_LABELS,
  deriveCustomerIdentityDecisionPreview,
  type CustomerIdentityDecision,
  type CustomerIdentityDecisionPreview,
  type CustomerIdentityDecisionPreviewStatus,
} from "@/lib/customer-window/identity-decision-preview";
import {
  normalizeCustomerWindowPeriodFacetsV2,
  normalizeCustomerWindowIdentityResolutionDetailV2,
  normalizeCustomerWindowRepresentationBookingsResponseV2,
  normalizeCustomerWindowRepresentationListV2,
  normalizeCustomerWindowRepresentationSearchV2,
  normalizeCustomerWindowRepresentationSummaryV2,
  type CustomerWindowContactSummaryV2,
  type CustomerWindowIdentityResolutionDetailV2,
  type CustomerWindowObservedContactV2,
  type CustomerWindowPeriodFacetsV2,
  type CustomerWindowRelatedContactV2,
  type CustomerWindowRepresentationBookingsResponseV2,
  type CustomerWindowRepresentationSearchItemV2,
  type CustomerWindowRepresentationSearchV2,
  type CustomerWindowRelatedReviewGroupV2,
  type CustomerWindowRepresentationSummaryV2,
  type CustomerWindowSafeCount,
} from "@/lib/customer-window/customer-representations-v2";
import {
  normalizeCustomerWindowRefreshHealth,
  type CustomerWindowRefreshHealth,
} from "@/lib/customer-window/customer-refresh-health";
import {
  getCustomerWindowJson,
  getCustomerWindowJsonWithRetry,
} from "@/lib/customer-window/customer-request-retry";

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

type CustomPeriodMode = "single" | "range";
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
type CustomerRepresentationListItemBaseV2 = {
  contactSummary: CustomerWindowContactSummaryV2;
  firstPurchaseAt: string | null;
  lastBookingAtInPeriod: string | null;
  lastPurchaseAt: string | null;
  representationId: string;
  representationKey: string;
  reservationsInPeriod: CustomerWindowSafeCount;
  totalReservations: CustomerWindowSafeCount;
};
type CustomerRepresentationListItemV2 = CustomerRepresentationListItemBaseV2 & (
  | {
      customerId: string;
      metricScope: "all_confirmed_sources";
      relatedGroupId: null;
      representationType: "confirmed_customer";
    }
  | {
      customerId: null;
      metricScope: "mcp_eap_active_snapshot";
      relatedGroupId: string;
      representationType: "related_review";
    }
);
type RepresentationPeriodListV2 = {
  items: CustomerRepresentationListItemV2[];
  page: number;
  pageSize: number;
  total: CustomerWindowSafeCount;
};
type CustomerSummary = Record<string, unknown> & { customerId: string; ok: boolean };
type Booking = Record<string, unknown> & {
  coupon_code?: string | null;
  discount_amount?: number | null;
  discount_percentage?: number | null;
  economic_days?: number | null;
  economic_eligible?: boolean;
  economics_available?: boolean;
  is_pack?: boolean;
  list_adr?: number | null;
  list_amount?: number | null;
  paid_adr?: number | null;
  paid_amount?: number | null;
  promotion_code?: string | null;
  source_row_id: number;
};
type Timeline = { items: Booking[]; total: number };
type ClassificationCriteria = Record<string, unknown>;
type CustomerEconomicsBaseValues = {
  averageBoletaTicket: number | null;
  discountUsagePct: number | null;
  discountAmount: number | null;
  economicDays: number | null;
  listAdr: number | null;
  listAmount: number | null;
  paidAdr: number | null;
  paidAmount: number | null;
  weightedDiscountPct: number | null;
};
type CustomerEconomicsTotal = CustomerEconomicsBaseValues & {
  boletaCount: number;
  discountedBoletaCount: number;
  packCount: number;
  totalReservations: number;
};
type CustomerEconomicsParking = CustomerEconomicsBaseValues & {
  bookingCount: number;
  discountedBookingCount: number;
};
type CustomerEconomics = {
  byParking: Record<string, CustomerEconomicsParking>;
  customerId: string;
  discountCodes: Array<{ code: string; lastUsedAt: string | null; source: string; uses: number }>;
  ok: boolean;
  total: CustomerEconomicsTotal;
};
type CustomerCommercialSignal = {
  asOfAt: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: Record<string, unknown>;
  label: string;
  signalKey: "PRICE_LIST_BUYER" | "OCCASIONAL_PROMO" | "DISCOUNT_DEPENDENT" | "PACK_CANDIDATE" | "RECOVERABLE";
};
type CustomerCommercialSignals = {
  customerId: string;
  ok: boolean;
  ruleVersion: string;
  signals: CustomerCommercialSignal[];
};
type CustomerIdentityValues = {
  emails: string[];
  phones: string[];
  plates: string[];
};
type CustomerIdentityCounts = { emails: number; phones: number; plates: number };
type CustomerIdentities = {
  confirmed: CustomerIdentityValues;
  conflictCounts: CustomerIdentityCounts;
  customerId: string;
  ok: boolean;
  pending: { plates: Array<{ confidence: string; value: string }> };
  pendingCounts: CustomerIdentityCounts;
};

const emptyRepresentationList: RepresentationPeriodListV2 = {
  items: [],
  page: 1,
  pageSize: PERIOD_PAGE_SIZE,
  total: 0,
};

function displayText(value: unknown, fallback = "No disponible") {
  return typeof value === "string" && value ? value : fallback;
}

function displayCount(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("es-CL") : "0";
}

function safeCountAsBigInt(value: CustomerWindowSafeCount) {
  return BigInt(value);
}

function displaySafeCount(value: CustomerWindowSafeCount) {
  return safeCountAsBigInt(value).toLocaleString("es-CL");
}

function representationPageCount(total: CustomerWindowSafeCount, pageSize: number) {
  const one = BigInt(1);
  const maximumPageCount = BigInt(2_147_483_647);
  const pages = (safeCountAsBigInt(total) + BigInt(pageSize) - one) / BigInt(pageSize);
  return Math.max(1, Number(pages > maximumPageCount ? maximumPageCount : pages));
}

function normalizeRepresentationListForUi(value: unknown): RepresentationPeriodListV2 | null {
  const normalized = normalizeCustomerWindowRepresentationListV2(value);
  if (!normalized) return null;
  const items = normalized.items.map((item): CustomerRepresentationListItemV2 | null => {
    const common = {
      contactSummary: item.contactSummary,
      firstPurchaseAt: item.firstPurchaseAt,
      lastBookingAtInPeriod: item.lastBookingAtInPeriod,
      lastPurchaseAt: item.lastPurchaseAt,
      representationId: item.representationId,
      representationKey: item.representationKey,
      reservationsInPeriod: item.reservationsInPeriod,
      totalReservations: item.totalReservations,
    };
    if (
      item.representationType === "confirmed_customer"
      && item.customerId !== null
      && item.relatedGroupId === null
      && item.metricScope === "all_confirmed_sources"
    ) return { ...common, customerId: item.customerId, metricScope: item.metricScope, relatedGroupId: null, representationType: item.representationType };
    if (
      item.representationType === "related_review"
      && item.customerId === null
      && item.relatedGroupId !== null
      && item.metricScope === "mcp_eap_active_snapshot"
    ) return { ...common, customerId: null, metricScope: item.metricScope, relatedGroupId: item.relatedGroupId, representationType: item.representationType };
    return null;
  });
  if (items.some((item) => item === null)) return null;
  return { ...normalized, items: items as CustomerRepresentationListItemV2[] };
}

function displayOptionalCount(value: unknown) {
  const count = finiteNumber(value);
  return count === null ? "No disponible" : count.toLocaleString("es-CL");
}

function displayDate(value: unknown) {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split("-").reverse().join("-") : "No disponible";
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function displayClp(value: unknown) {
  const amount = finiteNumber(value);
  return amount === null
    ? "No disponible"
    : new Intl.NumberFormat("es-CL", { currency: "CLP", maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function displayAdr(value: unknown) {
  const amount = finiteNumber(value);
  return amount === null ? "No disponible" : `${displayClp(amount)}/día`;
}

function displayDiscountPercentage(value: unknown) {
  const percentage = finiteNumber(value);
  if (percentage === null) return "No disponible";
  const formatted = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(percentage * 100);
  return percentage > 0 ? `-${formatted}%` : `${formatted}%`;
}

function displayPercentage(value: unknown) {
  const percentage = finiteNumber(value);
  return percentage === null
    ? "No disponible"
    : `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(percentage * 100)}%`;
}

function displayDecimal(value: unknown) {
  const number = finiteNumber(value);
  return number === null ? "No disponible" : number.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

function customerEconomicsParkingLabel(key: string) {
  const labels: Record<string, string> = {
    EAP: "EAP",
    MCP: "MCP",
    OKP_EXP: "OKP Express",
    OKP_FIDAE: "OKP FIDAE",
    OKP_PREMIUM: "OKP Premium",
    OKP_RC: "OKP RC",
  };
  return labels[key] ?? key;
}

function MetricLabel({ children, description }: { children: string; description: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span className="group relative inline-flex">
        <button aria-label={`${children}: ${description}`} className="rounded-full text-slate-400 outline-none transition hover:text-navy focus-visible:ring-2 focus-visible:ring-sea/30" type="button">
          <Info aria-hidden="true" className="h-3 w-3" />
        </button>
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-56 -translate-x-1/2 rounded-md bg-navy px-2.5 py-2 text-left text-[10px] font-normal leading-4 text-white shadow-lg group-hover:block group-focus-within:block" role="tooltip">{description}</span>
      </span>
    </span>
  );
}

function promotionCodeForBooking(booking: Booking) {
  const value = booking.source === "OKP" ? booking.coupon_code : booking.promotion_code;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

const getJson = getCustomerWindowJson;

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

function CustomerRepresentationFacets({ error, facets, loading }: {
  error: string | null;
  facets: CustomerWindowPeriodFacetsV2 | null;
  loading: boolean;
}) {
  const rows = facets ? [
    { label: "Representaciones", value: facets.totalRepresentations },
    { label: "Confirmados", value: facets.confirmedRepresentations },
    { label: "Relacionados / revisión", value: facets.relatedReviewRepresentations },
    { label: "Reservas del período", value: facets.totalBookingsInPeriod },
  ] : [];

  return (
    <section aria-label="Resumen de representaciones del período" className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      {loading && !facets ? <><p className="px-4 py-3 text-xs text-slate-600">Actualizando datos...</p><div className="grid animate-pulse gap-px bg-[#e4edf4] sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="h-24 bg-white" key={index} />)}</div></> : null}
      {error ? <p className="px-4 py-3 text-xs text-red-700" role="alert">No fue posible cargar los conteos de representaciones.</p> : null}
      {facets ? (
        <div className="relative"><div aria-live="polite" className="absolute right-4 top-2 text-[11px] text-slate-500">{loading ? "Actualizando..." : ""}</div><div className={`grid divide-y divide-[#e4edf4] transition-opacity sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 ${loading ? "opacity-60" : "opacity-100"}`}>
          {rows.map((row) => <div className="px-4 py-3" key={row.label}><p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{row.label}</p><p className="mt-1 text-2xl font-semibold leading-none text-navy">{displaySafeCount(row.value)}</p>{row.label === "Representaciones" ? <p className="mt-1 text-[11px] text-slate-500">Incluye grupos relacionados pendientes de revisión</p> : null}</div>)}
        </div></div>
      ) : null}
    </section>
  );
}

function formatRefreshTime(value: string | null) {
  if (!value) return "No disponible";
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function CustomerWindowRefreshHealthStrip({ error, health, loading }: {
  error: boolean;
  health: CustomerWindowRefreshHealth | null;
  loading: boolean;
}) {
  if (error) {
    return (
      <section aria-label="Estado de actualización de Customer Window" className="mt-5 border-y border-amber-200 bg-amber-50/70 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><TriangleAlert aria-hidden="true" className="h-4 w-4" />Estado de actualización no disponible</div>
        <p className="mt-1 text-xs text-amber-800">Las representaciones y conteos continúan disponibles.</p>
      </section>
    );
  }
  if (!health) {
    return loading ? (
      <section aria-label="Estado de actualización de Customer Window" className="mt-5 border-y border-[#d6e1ea] bg-white px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />Consultando estado de actualización...</div>
      </section>
    ) : null;
  }

  const presentation = {
    healthy: { Icon: CheckCircle2, title: "Customer Window actualizado", classes: "border-emerald-200 bg-emerald-50/70 text-emerald-900" },
    refreshing: { Icon: RefreshCw, title: "Actualizando Customer Window...", classes: "border-amber-200 bg-amber-50/70 text-amber-900" },
    stale: { Icon: Clock3, title: "Datos con retraso", classes: "border-orange-200 bg-orange-50/70 text-orange-900" },
    error: { Icon: TriangleAlert, title: "Última actualización con error", classes: "border-red-200 bg-red-50/70 text-red-900" },
  }[health.status];
  const { Icon } = presentation;
  const primaryTime = health.status === "healthy"
    ? `Datos vigentes desde ${formatRefreshTime(health.activeSnapshotActivatedAt)}`
    : `Última actualización exitosa: ${formatRefreshTime(health.lastSuccessAt)}`;
  const retentionLabel = health.retentionStatus === "active" ? "activa"
    : health.retentionStatus === "draining" ? "drenando históricos"
      : health.retentionStatus === "error" ? "con error" : "sin telemetría";

  return (
    <section aria-label="Estado de actualización de Customer Window" className={`mt-5 border-y px-5 py-3 ${presentation.classes}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold"><Icon aria-hidden="true" className={`h-4 w-4 ${health.status === "refreshing" ? "animate-spin" : ""}`} />{presentation.title}</div>
        <p className="text-xs">Frecuencia esperada: cada {health.cadenceMinutes} min</p>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>{primaryTime}</span>
        <span>Retención: {retentionLabel}</span>
        <span>Históricos pendientes: {health.retentionRemaining.toLocaleString("es-CL")}</span>
        {health.status === "error" && health.lastErrorCode ? <span title="Detalle operacional seguro">Detalle: {health.lastErrorCode}{health.lastErrorPhase ? ` / ${health.lastErrorPhase}` : ""}</span> : null}
      </div>
    </section>
  );
}

function representationContactLines(contact: CustomerWindowContactSummaryV2) {
  const related = contact.semantics === "observed";
  const emailCount = safeCountAsBigInt(contact.emailCount);
  const phoneCount = safeCountAsBigInt(contact.phoneCount);
  const email = contact.singleEmail
    ?? (emailCount > BigInt(0)
      ? `${displaySafeCount(contact.emailCount)} emails${related ? " relacionados" : ""}`
      : `Sin email${related ? " observado" : " confirmado"}`);
  const phone = contact.singlePhone
    ?? (phoneCount > BigInt(0)
      ? `${displaySafeCount(contact.phoneCount)} teléfonos${related ? " relacionados" : ""}`
      : `Sin teléfono${related ? " observado" : " confirmado"}`);
  return { email, phone };
}

function CustomerRepresentationTable({ error, list, loading, onPageChange, onSelectRepresentation }: {
  error: string | null;
  list: RepresentationPeriodListV2;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSelectRepresentation: (representation: CustomerRepresentationListItemV2) => void;
}) {
  const pageCount = representationPageCount(list.total, list.pageSize);

  return (
    <Panel count={`${displaySafeCount(list.total)} representaciones`} title="Representaciones MCP / EAP">
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">Actualizando datos...</p> : null}
      {loading && list.items.length > 0 ? <p aria-live="polite" className="mt-4 text-xs text-slate-500">Actualizando...</p> : null}
      {!loading && !error && list.items.length === 0 ? <div className="mt-4"><EmptyState description="No hay representaciones con reservas para este período." /></div> : null}
      {list.items.length > 0 ? (
        <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          <div className="max-h-[640px] overflow-y-auto overscroll-contain rounded-xl">
            <DataTable minWidth="760px">
              <DataTableHead><tr>{["Representación", "Reservas", "Primera compra", "Última compra", "Última reserva del período"].map((label) => <th className="border-b border-[#d6e1ea] px-3 py-2 text-left text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-slate-500" key={label}>{label}</th>)}</tr></DataTableHead>
              <DataTableBody>
                {list.items.map((representation) => {
                  const isConfirmed = representation.representationType === "confirmed_customer";
                  const contact = representationContactLines(representation.contactSummary);
                  return (
                    <tr
                      aria-label={isConfirmed ? "Abrir cliente confirmado" : "Seleccionar representación relacionada pendiente de revisión"}
                      className={`transition odd:bg-white even:bg-[#fbfcfd] hover:bg-[#eef7fb] focus:bg-[#eef7fb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sea/30 ${isConfirmed ? "cursor-pointer" : "cursor-default"}`}
                      key={representation.representationKey}
                      onClick={() => onSelectRepresentation(representation)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectRepresentation(representation);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="max-w-0 px-3 py-2 align-middle"><div className="min-w-0"><ValueBadge tone={isConfirmed ? "success" : "warning"}>{isConfirmed ? "Confirmado" : "Relacionado / revisión"}</ValueBadge><p className="mt-1 truncate text-xs font-medium text-navy" title={contact.email}>{contact.email}</p><p className="mt-0.5 truncate text-[11px] text-slate-500" title={contact.phone}>{contact.phone}</p></div></td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-700"><p><span className="font-medium text-navy">{displaySafeCount(representation.totalReservations)}</span> totales</p><p className="mt-0.5">{displaySafeCount(representation.reservationsInPeriod)} en el período</p></td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-700">{displayDate(representation.firstPurchaseAt)}</td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-700">{displayDate(representation.lastPurchaseAt)}</td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-700">{displayDate(representation.lastBookingAtInPeriod)}</td>
                    </tr>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || list.page <= 1} onClick={() => onPageChange(list.page - 1)} type="button">Anterior</button><span className="text-sm text-slate-600">Página {list.page} de {pageCount}</span><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || list.page >= pageCount} onClick={() => onPageChange(list.page + 1)} type="button">Siguiente</button></div>
        </div>
      ) : null}
    </Panel>
  );
}

function searchMatchLabel(item: CustomerWindowRepresentationSearchItemV2) {
  if (item.matchSemantics === "historically_related") return "Coincidencia histórica";
  if (item.matchSemantics === "booking") return item.matchValueType === "source_row_id" ? "ID de reserva exacto" : "Reserva exacta";
  if (item.matchSemantics === "source_customer") return "Cliente de origen exacto";
  if (item.matchValueType === "phone") return "Teléfono exacto";
  if (item.matchValueType === "plate") return "Patente exacta";
  return "Email exacto";
}

function CustomerRepresentationSearchResults({ loading, onSelect, query, result, error }: {
  error: string | null;
  loading: boolean;
  onSelect: (item: CustomerWindowRepresentationSearchItemV2) => void;
  query: string;
  result: CustomerWindowRepresentationSearchV2 | null;
}) {
  if (query.trim().length < 2) return null;
  return (
    <div className="mt-3 border-t border-[#e4edf4] pt-3">
      {loading ? <p className="text-xs text-slate-500">Buscando representaciones...</p> : null}
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
      {!loading && !error && result?.items.length === 0 ? <p className="text-xs text-slate-500">Sin coincidencias exactas.</p> : null}
      {result && result.items.length > 0 ? <><p className="mb-2 text-[11px] text-slate-500">{displaySafeCount(result.total)} coincidencia(s), mostrando hasta {result.limit}</p><ul className="divide-y divide-[#e4edf4] rounded-lg border border-[#e4edf4]">{result.items.map((item) => <li key={item.representationKey}><button className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-[#f3f9fc] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sea/30 sm:grid-cols-[minmax(0,1fr)_auto]" onClick={() => onSelect(item)} type="button"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ValueBadge tone={item.representationType === "confirmed_customer" ? "success" : "warning"}>{item.representationType === "confirmed_customer" ? "Confirmado" : "Relacionado / revisión"}</ValueBadge><span className="text-[10px] font-medium text-sea">{searchMatchLabel(item)}</span></div><p className="mt-1 truncate text-xs font-medium text-navy">{item.displayEmail ?? "Sin email observado"}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{item.displayPhone ?? "Sin teléfono observado"}</p></div><div className="text-left text-[11px] text-slate-500 sm:text-right"><p><span className="font-medium text-navy">{displaySafeCount(item.totalReservations)}</span> reservas</p><p className="mt-0.5">Última compra: {displayDate(item.lastPurchaseAt)}</p></div></button></li>)}</ul></> : null}
    </div>
  );
}

function SecondaryViewHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <button aria-label="Volver al detalle del cliente" className="rounded-lg border border-[#d7e3ec] p-1.5 text-navy transition hover:bg-[#f3f9fc] focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={onBack} title="Volver" type="button"><ChevronLeft className="h-4 w-4" /></button>
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
    </div>
  );
}

type CustomerPurchaseTimelineItem = {
  badge: string;
  badgeTone: BadgeTone;
  date: string;
  fields: Array<{ label: string; value: ReactNode }>;
  key: string;
  meta?: ReactNode;
  sourceLabel: string;
  sourceTone: "mcp" | "okp";
};

type CustomerContactDisplayItem = {
  meta?: string;
  value: string;
};

function sortObservedContactsByLastSeen(contacts: CustomerWindowObservedContactV2[]) {
  return contacts
    .map((contact, index) => {
      const parsedLastSeenAt = contact.lastSeenAt ? Date.parse(contact.lastSeenAt) : Number.NaN;
      return { contact, index, lastSeenAt: Number.isFinite(parsedLastSeenAt) ? parsedLastSeenAt : Number.NEGATIVE_INFINITY };
    })
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt || left.index - right.index)
    .map(({ contact }) => contact);
}

function CustomerRepresentationDrawerFrame({ badge, badgeTone, children, label, onClose, subtitle, title }: {
  badge: string;
  badgeTone: BadgeTone;
  children: ReactNode;
  label: string;
  onClose: () => void;
  subtitle?: string | null;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/35" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside aria-label={label} aria-modal="true" className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:max-w-2xl" role="dialog">
        <header className="z-10 shrink-0 border-b border-[#e4edf4] bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Ficha de cliente</p>
              <h2 className="mt-1.5 break-words text-base font-medium leading-5 text-navy">{title}</h2>
              {subtitle ? <p className="mt-1 break-words text-xs font-normal text-slate-500">{subtitle}</p> : null}
              <div className="mt-2"><ValueBadge tone={badgeTone}>{badge}</ValueBadge></div>
            </div>
            <button aria-label="Cerrar ficha de cliente" className="rounded-lg border border-[#d7e3ec] p-1.5 text-navy transition hover:bg-[#f3f9fc] focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={onClose} title="Cerrar" type="button"><X className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </aside>
    </div>
  );
}

function CustomerSummaryMetrics({ fields, loading }: {
  fields: Array<{ label: string; value: ReactNode }>;
  loading?: boolean;
}) {
  return (
    <section aria-labelledby="customer-representation-summary-title">
      <h3 className="text-sm font-medium text-slate-700" id="customer-representation-summary-title">Resumen</h3>
      {loading ? <div className="mt-3 grid animate-pulse gap-2 sm:grid-cols-2"><div className="h-16 rounded-lg bg-slate-100" /><div className="h-16 rounded-lg bg-slate-100" /></div> : null}
      {!loading && fields.length > 0 ? <dl className="mt-2 grid gap-x-4 gap-y-2 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map((field) => <div className="min-w-0" key={field.label}><dt className="text-[11px] font-normal text-slate-500">{field.label}</dt><dd className="mt-0.5 break-words text-sm font-medium text-navy">{field.value}</dd></div>)}</dl> : null}
    </section>
  );
}

function CustomerContactGroup({ emptyLabel, items, label, semantics, totalCount }: {
  emptyLabel: string;
  items: CustomerContactDisplayItem[];
  label: string;
  semantics: "Directo" | "Observado";
  totalCount: CustomerWindowSafeCount;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 1);
  const hiddenCount = Math.max(0, items.length - 1);
  return (
    <div className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2"><h4 className="text-[11px] font-normal text-slate-500">{label}</h4><span className="text-[11px] text-slate-400">{displaySafeCount(totalCount)}</span></div>
      {visibleItems.length > 0 ? <ul className="mt-1.5 divide-y divide-[#edf2f6]">{visibleItems.map((item) => <li className="min-w-0 py-1.5 first:pt-0 last:pb-0" key={item.value}><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-xs font-medium text-navy">{item.value}</p>{item.meta ? <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{item.meta}</p> : null}</div><ValueBadge tone={semantics === "Observado" ? "warning" : "success"}>{semantics}</ValueBadge></div></li>)}</ul> : <p className="mt-1.5 text-xs text-slate-400">{BigInt(totalCount) > BigInt(0) ? "Disponible en el detalle de Contactos" : emptyLabel}</p>}
      {hiddenCount > 0 ? <button aria-expanded={expanded} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sea hover:text-navy focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? "Ver menos" : `Ver ${hiddenCount} más`}{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button> : null}
    </div>
  );
}

function CustomerContactOverview({ emailItems, emailTotal, loading, phoneItems, phoneTotal, semantics }: {
  emailItems: CustomerContactDisplayItem[];
  emailTotal: CustomerWindowSafeCount;
  loading?: boolean;
  phoneItems: CustomerContactDisplayItem[];
  phoneTotal: CustomerWindowSafeCount;
  semantics: "Directo" | "Observado";
}) {
  return (
    <section aria-labelledby="customer-contact-overview-title">
      <h3 className="text-sm font-medium text-slate-700" id="customer-contact-overview-title">Contactos</h3>
      {loading ? <div className="mt-2 grid animate-pulse gap-2 sm:grid-cols-2"><div className="h-16 rounded-lg bg-slate-100" /><div className="h-16 rounded-lg bg-slate-100" /></div> : <div className="mt-2 grid gap-2 sm:grid-cols-2"><CustomerContactGroup emptyLabel="Sin email disponible" items={emailItems} label="Email" semantics={semantics} totalCount={emailTotal} /><CustomerContactGroup emptyLabel="Sin teléfono disponible" items={phoneItems} label="Teléfono" semantics={semantics} totalCount={phoneTotal} /></div>}
    </section>
  );
}

function CustomerDrawerActions({ actions, label }: {
  actions: Array<{ disabled?: boolean; label: string; onClick: () => void }>;
  label: string;
}) {
  return <section aria-label={label} className="flex flex-wrap gap-2">{actions.map((action) => <button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-xs font-medium text-navy transition hover:border-sea focus:outline-none focus:ring-2 focus:ring-sea/30 disabled:cursor-not-allowed disabled:opacity-50" disabled={action.disabled} key={action.label} onClick={action.onClick} type="button">{action.label}</button>)}</section>;
}

function CustomerPurchaseTimeline({ emptyDescription, error, items, loading, onNext, onPrevious, page, pageCount, total }: {
  emptyDescription: string;
  error: string | null;
  items: CustomerPurchaseTimelineItem[];
  loading: boolean;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  pageCount: number;
  total: number;
}) {
  return (
    <section aria-labelledby="customer-purchase-history-title">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-slate-700" id="customer-purchase-history-title">Historial de compras</h3><span className="text-xs font-normal text-slate-500">{displayCount(total)} reservas</span></div>
      {loading ? <p className="mt-3 text-xs text-slate-500">Cargando reservas...</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <div className="mt-4"><EmptyState description={emptyDescription} /></div> : null}
      {items.length > 0 ? <ol className="relative mt-3 before:absolute before:bottom-0 before:left-[9px] before:top-0 before:w-px before:bg-[#d7e3ec] sm:before:left-1/2">{items.map((item) => {
        const isOkp = item.sourceTone === "okp";
        return <li className="relative grid grid-cols-[20px_minmax(0,1fr)] pb-4 last:pb-0 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]" key={item.key}><span className={`relative z-[1] col-start-1 row-start-1 mt-3 h-2.5 w-2.5 justify-self-center rounded-full border-2 border-white ring-1 sm:col-start-2 ${isOkp ? "bg-[#00a86b] ring-[#a7dcc4]" : "bg-[#2563a6] ring-[#b7cee5]"}`} /><details className={`group col-start-2 row-start-1 min-w-0 rounded-lg border border-l-2 p-2.5 shadow-[0_3px_10px_rgba(2,53,116,0.035)] transition ${isOkp ? "border-[#cce9dc] border-l-[#00a86b] bg-[#f8fcfa] hover:border-[#8fd0b1] open:border-[#8fd0b1] sm:col-start-3 sm:ml-1" : "border-[#d6e4f2] border-l-[#2563a6] bg-[#f8fbfe] hover:border-[#9bbdde] open:border-[#9bbdde] sm:col-start-1 sm:mr-1"}`}><summary className={`cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-sea/30 [&::-webkit-details-marker]:hidden ${isOkp ? "" : "sm:text-right"}`}><div className={`flex flex-wrap items-start gap-1.5 ${isOkp ? "justify-between" : "justify-between sm:flex-row-reverse"}`}><div><p className="text-xs font-medium text-navy">{item.date}</p><p className="mt-0.5 text-[11px] font-normal text-slate-500">{item.sourceLabel}</p></div><ValueBadge tone={item.badgeTone}>{item.badge}</ValueBadge></div>{item.meta ? <div className={`mt-1.5 text-[11px] ${isOkp ? "" : "sm:text-right"}`}>{item.meta}</div> : null}</summary><dl className={`mt-2 grid gap-1.5 border-t border-[#e7eef4] pt-2 text-xs sm:grid-cols-2 ${isOkp ? "" : "sm:text-right"}`}>{item.fields.map((field) => <div key={field.label}><dt className="text-[11px] font-normal text-slate-500">{field.label}</dt><dd className="break-words font-medium text-navy">{field.value}</dd></div>)}</dl></details></li>;
      })}</ol> : null}
      <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || page <= 1} onClick={onPrevious} type="button">Anterior</button><span className="text-sm text-slate-600">Página {page} de {pageCount}</span><button className="rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading || page >= pageCount} onClick={onNext} type="button">Siguiente</button></div>
    </section>
  );
}

type CustomerIdentityReviewSignal = { detail: string; label: string };
type CustomerIdentityResolutionEventV2 = CustomerWindowIdentityResolutionDetailV2["events"][number];
type CustomerIdentityResolutionEventGroupV2 = {
  events: CustomerIdentityResolutionEventV2[];
  evidence: CustomerIdentityResolutionEventV2["evidence"];
  key: string;
  reason: string;
  resolverVersion: string;
};

const IDENTITY_PROFILE_INITIAL_LIMIT = 8;
const IDENTITY_EVENT_GROUP_INITIAL_LIMIT = 8;

function identityResolutionReasonLabel(reason: string) {
  if (reason === "contradictory_phone_email") return "Este teléfono fue observado históricamente asociado a más de un email.";
  if (reason === "review_profile_reused_exact") return "El resolver reutilizó un perfil previamente en revisión al encontrar coincidencias exactas.";
  if (reason === "review_profile_reused_source_customer_email") return "El resolver reutilizó un perfil en revisión al coincidir cliente de origen y email.";
  if (reason === "signals_link_multiple_profiles") return "Las señales observadas se relacionan con más de un perfil.";
  if (reason === "insufficient_high_signals") return "No había suficientes señales de alta confianza para confirmar la identidad.";
  if (reason === "requires_review") return "La resolución quedó pendiente de revisión manual.";
  return "Motivo histórico sin traducción disponible.";
}

function abbreviatedIdentifier(value: string | null) {
  if (!value) return "No disponible";
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function identityResolutionEvidenceText(key: string, value: boolean | CustomerWindowSafeCount) {
  if (key === "emailsForPhone") return `El teléfono observado está asociado a ${displaySafeCount(value as CustomerWindowSafeCount)} email(s).`;
  if (key === "phonesForEmail") return `Este email fue observado asociado a ${displaySafeCount(value as CustomerWindowSafeCount)} teléfono(s).`;
  if (key === "emailBookingCount") return `El email aparece en ${displaySafeCount(value as CustomerWindowSafeCount)} reserva(s) de la evidencia.`;
  if (key === "phoneBookingCount") return `El teléfono aparece en ${displaySafeCount(value as CustomerWindowSafeCount)} reserva(s) de la evidencia.`;
  if (key === "contradictorySignals") return value ? "El resolver detectó señales históricas contradictorias." : "El resolver no marcó señales contradictorias en este evento.";
  if (key === "matchedByEmail") return value ? "La relación incluyó una coincidencia exacta de email." : "La relación no se apoyó en una coincidencia exacta de email.";
  if (key === "matchedBySourceCustomerId") return value ? "La relación incluyó una coincidencia de cliente de origen." : "La relación no se apoyó en una coincidencia de cliente de origen.";
  if (key === "reusedReviewProfile") return value ? "El resolver reutilizó un perfil que ya estaba en revisión." : "El resolver no reutilizó un perfil en revisión.";
  return `${key}: ${String(value)}`;
}

function identityResolutionEvidenceSignature(evidence: CustomerIdentityResolutionEventV2["evidence"]) {
  return Object.entries(evidence)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");
}

function groupIdentityResolutionEvents(events: CustomerIdentityResolutionEventV2[]) {
  const groups = new Map<string, CustomerIdentityResolutionEventGroupV2>();
  for (const event of events) {
    const key = JSON.stringify([event.reason, event.resolverVersion, identityResolutionEvidenceSignature(event.evidence)]);
    const current = groups.get(key);
    if (current) current.events.push(event);
    else groups.set(key, { events: [event], evidence: event.evidence, key, reason: event.reason, resolverVersion: event.resolverVersion });
  }
  return Array.from(groups.values());
}

function CustomerIdentityResolutionEventGroup({ group }: { group: CustomerIdentityResolutionEventGroupV2 }) {
  const [expanded, setExpanded] = useState(false);
  const hasConflict = group.events.some((event) => event.eventType === "conflict");
  return (
    <li className="rounded-lg border border-[#e4edf4] px-3 py-3">
      <button aria-expanded={expanded} className="flex w-full items-start justify-between gap-3 text-left focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={() => setExpanded((current) => !current)} type="button">
        <span className="min-w-0"><span className="block text-xs font-medium leading-5 text-navy">{identityResolutionReasonLabel(group.reason)}</span><span className="mt-1 block text-[10px] text-slate-500">{group.resolverVersion} · {displayCount(group.events.length)} evento(s) equivalente(s)</span></span>
        <span className="flex shrink-0 items-center gap-2"><ValueBadge tone={hasConflict ? "warning" : "neutral"}>{hasConflict ? "Requiere revisión" : "Relacionado"}</ValueBadge>{expanded ? <ChevronUp aria-hidden="true" className="h-4 w-4 text-slate-500" /> : <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />}</span>
      </button>
      {Object.entries(group.evidence).length > 0 ? <ul className="mt-2 space-y-1 border-t border-[#edf2f6] pt-2">{Object.entries(group.evidence).map(([key, value]) => <li className="text-[11px] leading-4 text-slate-600" key={key}>{identityResolutionEvidenceText(key, value)}</li>)}</ul> : null}
      {expanded ? <ol className="mt-3 space-y-2 border-t border-[#edf2f6] pt-3">{group.events.map((event) => <li className="rounded border border-[#edf2f6] bg-[#fbfcfd] px-2.5 py-2" key={event.eventId}><div className="flex flex-wrap justify-between gap-2"><span className="text-[11px] font-medium text-navy">{displayDate(event.createdAt)}</span><span className="text-[10px] text-slate-500">Reserva fuente {displaySafeCount(event.sourceRowId)}</span></div><p className="mt-1 text-[10px] text-slate-500">Perfil {abbreviatedIdentifier(event.profileId)} · {event.source}</p><details className="mt-1.5"><summary className="cursor-pointer text-[10px] font-medium text-slate-600">Detalle técnico de evidencia</summary><dl className="mt-1 grid gap-1 sm:grid-cols-2"><div><dt className="text-[10px] text-slate-500">Motivo</dt><dd className="break-all font-mono text-[10px] text-slate-700">{event.reason}</dd></div>{Object.entries(event.evidence).map(([key, value]) => <div key={key}><dt className="break-all font-mono text-[10px] text-slate-500">{key}</dt><dd className="text-[10px] font-medium text-navy">{String(value)}</dd></div>)}</dl></details></li>)}</ol> : null}
    </li>
  );
}

function CustomerIdentityReviewSignals({ emptyLabel, items, tone, title }: {
  emptyLabel: string;
  items: CustomerIdentityReviewSignal[];
  tone: "support" | "review";
  title: string;
}) {
  const Icon = tone === "support" ? CheckCircle2 : TriangleAlert;
  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-3">
      <h4 className="text-xs font-medium text-navy">{title}</h4>
      {items.length > 0 ? <ul className="mt-2 space-y-2">{items.map((item) => <li className="flex items-start gap-2" key={item.label}><Icon aria-hidden="true" className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone === "support" ? "text-emerald-600" : "text-amber-600"}`} /><div><p className="text-xs font-medium text-slate-700">{item.label}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.detail}</p></div></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">{emptyLabel}</p>}
    </section>
  );
}

const RELATED_CONTACT_INITIAL_LIMIT = 5;

function CustomerRelatedContactList({ contacts, label }: {
  contacts: CustomerWindowRelatedContactV2[];
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleContacts = expanded ? contacts : contacts.slice(0, RELATED_CONTACT_INITIAL_LIMIT);
  const hiddenCount = Math.max(0, contacts.length - RELATED_CONTACT_INITIAL_LIMIT);
  return (
    <div className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-3">
      <div className="flex items-center justify-between gap-2"><h5 className="text-xs font-medium text-navy">{label}</h5><span className="text-[11px] text-slate-500">{displayCount(contacts.length)}</span></div>
      <ul className="mt-2 divide-y divide-[#edf2f6]">{visibleContacts.map((contact) => { const relationDetail = contact.relationReason === "same_phone_history" ? "Relacionado por historial del mismo teléfono" : contact.relationReason === "same_email_history" ? "Relacionado por historial del mismo email" : contact.relationReason === "same_profile_history" ? "Relacionado por historial del mismo perfil" : null; return <li className="min-w-0 py-2 first:pt-0 last:pb-0" key={`${contact.relation}-${contact.value}-${contact.profileId ?? "group"}`}><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-xs font-medium text-navy">{contact.value}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{displaySafeCount(contact.bookingCount)} reserva(s) · {displaySafeCount(contact.sourceCount)} fuente(s){contact.firstSeenAt || contact.lastSeenAt ? ` · ${displayDate(contact.firstSeenAt)} a ${displayDate(contact.lastSeenAt)}` : ""}</p>{relationDetail ? <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{relationDetail}</p> : null}</div><ValueBadge tone={contact.relation === "observed_in_group" ? "warning" : "neutral"}>{contact.relation === "observed_in_group" ? "Observado en este grupo" : "Relacionado históricamente"}</ValueBadge></div></li>; })}</ul>
      {hiddenCount > 0 ? <button aria-expanded={expanded} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sea hover:text-navy focus:outline-none focus:ring-2 focus:ring-sea/30" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? "Ver menos" : `Ver todos (${displayCount(contacts.length)})`}{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button> : null}
    </div>
  );
}

function CustomerRelatedContacts({ contacts }: {
  contacts: CustomerWindowIdentityResolutionDetailV2["relatedContacts"] | null;
}) {
  if (!contacts || (contacts.emails.length === 0 && contacts.phones.length === 0)) return null;
  return (
    <section aria-labelledby="identity-related-contacts-title" className="mt-5">
      <h4 className="text-sm font-medium text-slate-700" id="identity-related-contacts-title">Contactos relacionados</h4>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">Los históricos explican relaciones del caso; no confirman que pertenezcan a una misma persona.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{contacts.emails.length > 0 ? <CustomerRelatedContactList contacts={contacts.emails} label="Emails" /> : null}{contacts.phones.length > 0 ? <CustomerRelatedContactList contacts={contacts.phones} label="Teléfonos" /> : null}</div>
    </section>
  );
}

const CUSTOMER_IDENTITY_PREVIEW_STATUS: Record<CustomerIdentityDecisionPreviewStatus, { label: string; tone: BadgeTone }> = {
  blocked: { label: "Bloqueado", tone: "danger" },
  informational: { label: "Informativo", tone: "info" },
  potentially_safe: { label: "Potencialmente seguro", tone: "success" },
  requires_additional_contract: { label: "Requiere contrato adicional", tone: "warning" },
};

function CustomerIdentityDecisionPreviewPanel({ preview }: { preview: CustomerIdentityDecisionPreview }) {
  const status = CUSTOMER_IDENTITY_PREVIEW_STATUS[preview.status];
  return (
    <div className="mt-3 rounded-lg border border-[#d7e3ec] bg-[#fbfcfd] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h5 className="text-sm font-medium text-navy">{CUSTOMER_IDENTITY_DECISION_LABELS[preview.decision]}</h5><p className="mt-1 text-xs leading-5 text-slate-600">{preview.summary}</p></div><ValueBadge tone={status.tone}>{status.label}</ValueBadge></div>
      <dl className="mt-3 grid gap-x-3 gap-y-2 border-t border-[#e7eef4] pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Perfiles afectados", displaySafeCount(preview.profiles)], ["Reservas afectadas", displaySafeCount(preview.reservations)], ["Links conflict", displaySafeCount(preview.conflictLinks)], ["Links candidate", displaySafeCount(preview.candidateLinks)], ["Merge", preview.merge], ["Operación en un perfil", preview.singleProfileOperation], ["Canonical profile seguro", preview.canonicalProfileSafe ? "Sí: perfil único activo" : "Canonical profile no determinado."], ["Snapshot actual", "Nunca se modifica directamente"]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-slate-500">{label}</dt><dd className="mt-0.5 text-xs font-medium text-navy">{value}</dd></div>)}
      </dl>
      <div className="mt-3 grid gap-3 border-t border-[#e7eef4] pt-3 sm:grid-cols-2">
        <div><h6 className="text-xs font-medium text-slate-700">Si se implementara, cambiaría</h6><ul className="mt-1.5 space-y-1">{preview.changes.map((item) => <li className="text-[11px] leading-4 text-slate-600" key={item}>• {item}</li>)}</ul></div>
        <div><h6 className="text-xs font-medium text-slate-700">No cambiaría directamente</h6><ul className="mt-1.5 space-y-1">{preview.unchanged.map((item) => <li className="text-[11px] leading-4 text-slate-600" key={item}>• {item}</li>)}</ul></div>
      </div>
      <div className="mt-3 border-t border-[#e7eef4] pt-3"><h6 className="text-xs font-medium text-slate-700">Antes de poder ejecutar esta acción se necesita:</h6><ul className="mt-1.5 space-y-1">{preview.blockers.map((item) => <li className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600" key={item}><TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />{item}</li>)}</ul></div>
    </div>
  );
}

function CustomerIdentityResolutionPanel({ detail, detailError, detailLoading, group, loading, onBack, onRetry, timeline }: {
  detail: CustomerWindowIdentityResolutionDetailV2 | null;
  detailError: string | null;
  detailLoading: boolean;
  group: CustomerWindowRelatedReviewGroupV2 | null;
  loading: boolean;
  onBack: () => void;
  onRetry: () => void;
  timeline: ReactNode;
}) {
  const [showAllEventGroups, setShowAllEventGroups] = useState(false);
  const [showAllProfiles, setShowAllProfiles] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<CustomerIdentityDecision | null>(null);
  const resolutionSummary = detail?.summary ?? group;
  const profileCount = BigInt(resolutionSummary?.profileCount ?? 0);
  const bookingCount = BigInt(resolutionSummary?.bookingCount ?? 0);
  const emailCount = BigInt(resolutionSummary?.emailCount ?? 0);
  const phoneCount = BigInt(resolutionSummary?.phoneCount ?? 0);
  const sourceCustomerCount = BigInt(resolutionSummary?.sourceCustomerCount ?? 0);
  const conflictCount = BigInt(resolutionSummary?.conflictCount ?? 0);
  const candidateCount = BigInt(resolutionSummary?.candidateCount ?? 0);
  const exactEmailMembers = detail ? detail.members.length > 0 && detail.members.every((member) => member.relationshipType === "EXACT_EMAIL") : false;
  const contradictoryPhoneEmail = detail?.events.some((event) => event.reason === "contradictory_phone_email" || event.evidence.contradictorySignals === true) ?? false;
  const eventGroups = groupIdentityResolutionEvents(detail?.events ?? []);
  const visibleEventGroups = showAllEventGroups ? eventGroups : eventGroups.slice(0, IDENTITY_EVENT_GROUP_INITIAL_LIMIT);
  const visibleProfiles = showAllProfiles ? detail?.profiles ?? [] : detail?.profiles.slice(0, IDENTITY_PROFILE_INITIAL_LIMIT) ?? [];
  const supportingSignals: CustomerIdentityReviewSignal[] = [];
  const reviewSignals: CustomerIdentityReviewSignal[] = [];

  if (profileCount === BigInt(1)) supportingSignals.push({ label: "Reservas en un mismo perfil", detail: "Las reservas del grupo ya están asociadas al mismo perfil." });
  if (emailCount === BigInt(1)) supportingSignals.push({ label: "Email exacto compartido", detail: "El conjunto contiene un único email observado." });
  if (phoneCount === BigInt(1)) supportingSignals.push({ label: "Teléfono consistente", detail: "El conjunto contiene un único teléfono observado." });
  if (sourceCustomerCount === BigInt(1)) supportingSignals.push({ label: "Cliente de origen compartido", detail: "El conjunto contiene un único identificador de cliente de origen." });
  if (group?.hasExactEmailPhoneCorroboration) supportingSignals.push({ label: "Email y teléfono corroborados", detail: "Existe una coincidencia exacta de email y teléfono dentro del grupo." });
  if (group?.hasSourceCustomerEmailCorroboration) supportingSignals.push({ label: "Cliente de origen y email corroborados", detail: "Existe una coincidencia exacta entre cliente de origen y email." });

  if (profileCount > BigInt(1)) reviewSignals.push({ label: "Varios perfiles relacionados", detail: `${displaySafeCount(resolutionSummary?.profileCount ?? 0)} perfiles participan en este grupo.` });
  if (emailCount > BigInt(1)) reviewSignals.push({ label: "Varios emails observados", detail: `${displaySafeCount(resolutionSummary?.emailCount ?? 0)} emails aparecen en el conjunto.` });
  if (phoneCount > BigInt(1)) reviewSignals.push({ label: "Varios teléfonos observados", detail: `${displaySafeCount(resolutionSummary?.phoneCount ?? 0)} teléfonos aparecen en el conjunto.` });
  if (conflictCount > BigInt(0)) reviewSignals.push({ label: "Links en revisión", detail: `${displaySafeCount(resolutionSummary?.conflictCount ?? 0)} links tienen estado conflict.` });
  if (candidateCount > BigInt(0)) reviewSignals.push({ label: "Links candidatos", detail: `${displaySafeCount(resolutionSummary?.candidateCount ?? 0)} links tienen estado candidate.` });
  if (contradictoryPhoneEmail) reviewSignals.push({ label: "Señales históricas contradictorias", detail: "El historial relaciona un mismo email con más de un teléfono observado." });

  const principalExplanation = emailCount === BigInt(1) && phoneCount > BigInt(1) && exactEmailMembers && contradictoryPhoneEmail
    ? "Las reservas comparten un mismo email exacto, pero el historial registra señales de teléfono contradictorias. Por eso permanecen relacionadas para revisión y no se confirma una única identidad."
    : profileCount === BigInt(1)
      ? "Las reservas ya están asociadas al mismo perfil, pero existen señales históricas que requieren revisión."
      : "Las señales observadas conectan estas reservas, pero la evidencia disponible no permite confirmar una única identidad.";
  const showSharedAccountHypothesis = emailCount === BigInt(1) && phoneCount > BigInt(1) && profileCount > BigInt(1) && bookingCount >= BigInt(4);
  const decisionPreview = selectedDecision ? deriveCustomerIdentityDecisionPreview(selectedDecision, detail, group) : null;

  return (
    <section aria-labelledby="customer-identity-resolution-title">
      <SecondaryViewHeader onBack={onBack} title="Resolver identidad" />
      <div className="mt-4 flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-slate-700" id="customer-identity-resolution-title">Resumen del caso</h3><ValueBadge tone="warning">Relacionado / revisión</ValueBadge></div>
      {loading ? <p className="mt-3 text-xs text-slate-500">Cargando evidencia disponible...</p> : null}
      {detailLoading ? <p className="mt-3 text-xs text-slate-500">Cargando historial de resolución...</p> : null}
      {detailError ? <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2" role="alert"><p className="text-xs text-red-700">{detailError}</p><button className="mt-2 text-xs font-medium text-red-800 underline underline-offset-2" onClick={onRetry} type="button">Reintentar</button></div> : null}
      {group ? <>
        <dl className="mt-2 grid gap-x-4 gap-y-2 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {[["Perfiles involucrados", resolutionSummary?.profileCount ?? 0], ["Reservas involucradas", resolutionSummary?.bookingCount ?? 0], ["Emails observados", resolutionSummary?.emailCount ?? 0], ["Teléfonos observados", resolutionSummary?.phoneCount ?? 0], ["Clientes de origen", resolutionSummary?.sourceCustomerCount ?? 0], ["Links conflict / candidate", `${displaySafeCount(resolutionSummary?.conflictCount ?? 0)} / ${displaySafeCount(resolutionSummary?.candidateCount ?? 0)}`]].map(([label, value]) => <div key={String(label)}><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-medium text-navy">{typeof value === "string" ? value : displaySafeCount(value)}</dd></div>)}
        </dl>
        <p className="mt-3 rounded-lg border border-[#d6e4f2] bg-[#f8fbfe] px-3 py-2 text-xs leading-5 text-slate-700">{principalExplanation}</p>
        {showSharedAccountHypothesis ? <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">La combinación de un email, varios teléfonos, varios perfiles y múltiples reservas también podría corresponder a una cuenta compradora compartida o a reservas realizadas para terceros. Es una hipótesis contextual, no una conclusión de identidad.</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><CustomerIdentityReviewSignals emptyLabel="No hay corroboraciones explícitas disponibles." items={supportingSignals} title="Señales a favor" tone="support" /><CustomerIdentityReviewSignals emptyLabel="No hay señales adicionales disponibles en este read model." items={reviewSignals} title="Señales de revisión" tone="review" /></div>
        <section aria-labelledby="identity-decision-preview-title" className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-medium text-slate-700" id="identity-decision-preview-title">Posibles decisiones</h4><p className="mt-0.5 text-[11px] text-slate-500">Si eligieras una decisión, esto es lo que podría ocurrir. La vista no recomienda ni ejecuta acciones.</p></div><ValueBadge tone="neutral">Solo vista previa</ValueBadge></div><div aria-label="Opciones conceptuales de identidad" className="mt-2 grid gap-2 sm:grid-cols-2">{(Object.keys(CUSTOMER_IDENTITY_DECISION_LABELS) as CustomerIdentityDecision[]).map((decision) => <button aria-pressed={selectedDecision === decision} className={`min-h-12 rounded-lg border px-3 py-2 text-left text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-sea/30 ${selectedDecision === decision ? "border-sea bg-[#eef7f7] text-navy" : "border-[#d7e3ec] bg-white text-slate-700 hover:border-[#9fb8ca]"}`} key={decision} onClick={() => setSelectedDecision(decision)} type="button">{CUSTOMER_IDENTITY_DECISION_LABELS[decision]}</button>)}</div>{decisionPreview ? <CustomerIdentityDecisionPreviewPanel preview={decisionPreview} /> : <p className="mt-2 text-xs text-slate-500">Selecciona una opción para revisar su impacto conceptual.</p>}</section>
        <section className="mt-5" aria-labelledby="identity-review-profiles-title"><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-medium text-slate-700" id="identity-review-profiles-title">Perfiles involucrados</h4>{detail?.profiles.length ? <span className="text-xs text-slate-500">{displayCount(detail.profiles.length)} perfiles</span> : null}</div>{visibleProfiles.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{visibleProfiles.map((profile) => <article className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-3" key={profile.profileId}><div className="flex items-start justify-between gap-2"><p className="font-mono text-xs font-medium text-navy" title={profile.profileId}>{abbreviatedIdentifier(profile.profileId)}</p><ValueBadge tone={profile.status === "active" ? "success" : profile.status === "merged" ? "neutral" : "warning"}>{profile.status}</ValueBadge></div><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"><div><dt className="text-[10px] text-slate-500">Reservas del grupo</dt><dd className="text-xs font-medium text-navy">{displaySafeCount(profile.bookingCount)}</dd></div><div><dt className="text-[10px] text-slate-500">Resolver</dt><dd className="break-words text-xs font-medium text-navy">{profile.resolverVersions.join(", ")}</dd></div><div><dt className="text-[10px] text-slate-500">Primera reserva</dt><dd className="text-xs font-medium text-navy">{displayDate(profile.firstBookingAt)}</dd></div><div><dt className="text-[10px] text-slate-500">Última reserva</dt><dd className="text-xs font-medium text-navy">{displayDate(profile.lastBookingAt)}</dd></div>{profile.mergedIntoProfileId ? <div className="col-span-2"><dt className="text-[10px] text-slate-500">Fusionado en</dt><dd className="font-mono text-xs font-medium text-navy" title={profile.mergedIntoProfileId}>{abbreviatedIdentifier(profile.mergedIntoProfileId)}</dd></div> : null}</dl></article>)}</div> : !detailLoading ? <p className="mt-1.5 text-xs leading-5 text-slate-500">El detalle de perfiles no está disponible.</p> : null}{detail && detail.profiles.length > IDENTITY_PROFILE_INITIAL_LIMIT ? <button className="mt-2 text-xs font-medium text-sea underline underline-offset-2" onClick={() => setShowAllProfiles((current) => !current)} type="button">{showAllProfiles ? "Mostrar menos perfiles" : `Ver todos los perfiles (${displayCount(detail.profiles.length)})`}</button> : null}</section>
        <CustomerRelatedContacts contacts={detail?.relatedContacts ?? null} />
        <section className="mt-5" aria-labelledby="identity-review-resolver-title"><h4 className="text-sm font-medium text-slate-700" id="identity-review-resolver-title">Historial de resolución</h4><dl className="mt-2 grid gap-2 rounded-lg border border-[#e4edf4] px-3 py-3 sm:grid-cols-2"><div><dt className="text-[11px] text-slate-500">Reservas V1</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displaySafeCount(group.v1BookingCount)}</dd></div><div><dt className="text-[11px] text-slate-500">Reservas V2</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displaySafeCount(group.v2BookingCount)}</dd></div></dl>{visibleEventGroups.length ? <ol className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain pr-1">{visibleEventGroups.map((eventGroup) => <CustomerIdentityResolutionEventGroup group={eventGroup} key={eventGroup.key} />)}</ol> : !detailLoading ? <p className="mt-2 text-xs leading-5 text-slate-500">No hay eventos históricos disponibles para las reservas de este grupo.</p> : null}{eventGroups.length > IDENTITY_EVENT_GROUP_INITIAL_LIMIT ? <button className="mt-2 text-xs font-medium text-sea underline underline-offset-2" onClick={() => setShowAllEventGroups((current) => !current)} type="button">{showAllEventGroups ? "Mostrar menos motivos" : `Ver todos los motivos (${displayCount(eventGroups.length)})`}</button> : null}</section>
        <div className="mt-5">{timeline}</div>
      </> : !loading ? <p className="mt-3 text-xs text-slate-500">No hay evidencia de grupo disponible.</p> : null}
    </section>
  );
}

function CustomerEconomicsPanel({ economics, error, loading, onBack }: { economics: CustomerEconomics | null; error: string | null; loading: boolean; onBack: () => void }) {
  return (
    <section aria-labelledby="customer-economics-title">
      <SecondaryViewHeader onBack={onBack} title="Economía del cliente" />
      <h3 className="sr-only" id="customer-economics-title">Economía del cliente</h3>
      {loading ? <p className="mt-3 text-xs text-slate-500">Cargando economía...</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {economics?.ok ? (
        <div className="mt-3 space-y-4">
          <dl className="grid gap-x-4 gap-y-3 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Gasto histórico", displayClp(economics.total.paidAmount), "Suma de lo efectivamente pagado en reservas Boleta económicamente válidas. No incluye Packs."],
              ["Valor promedio reserva", displayClp(economics.total.averageBoletaTicket), "Promedio pagado por reserva Boleta. Se calcula como gasto total dividido por cantidad de Boletas elegibles. No es ADR."],
              ["ADR pagado", displayAdr(economics.total.paidAdr), "Valor efectivamente pagado por día reservado. Suma de pagos dividida por suma de días."],
              ["ADR lista", displayAdr(economics.total.listAdr), "Valor lista antes de descuentos por día reservado. Suma de precio lista dividida por suma de días."],
              ["Descuento ponderado", displayDiscountPercentage(economics.total.weightedDiscountPct), "Porcentaje del precio lista total que fue descontado. Se calcula usando sumas, no promediando porcentajes individuales."],
              ["Boletas con descuento", `${displayCount(economics.total.discountedBoletaCount)} / ${displayCount(economics.total.boletaCount)} · ${displayPercentage(economics.total.discountUsagePct)}`, "Cantidad y porcentaje de reservas Boleta en las que se aplicó algún descuento."],
              ["Días económicos", displayOptionalCount(economics.total.economicDays), "Total de días de reservas Boleta utilizados para los cálculos de ADR. No incluye Packs ni reservas económicamente no evaluables."],
            ].map(([label, value, description]) => <div className="min-w-0" key={label as string}><dt className="text-[11px] font-normal text-slate-500"><MetricLabel description={description as string}>{label as string}</MetricLabel></dt><dd className="mt-0.5 break-words text-sm font-medium text-navy">{value}</dd></div>)}
            <div className="min-w-0"><dt className="text-[11px] font-normal text-slate-500">Boletas</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displayCount(economics.total.boletaCount)}</dd></div>
            <div className="min-w-0"><dt className="text-[11px] font-normal text-slate-500">Packs</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displayCount(economics.total.packCount)}</dd></div>
          </dl>

          {Object.keys(economics.byParking).length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-600">Por estacionamiento</p>
              <div className="mt-1.5 grid gap-2">
                {(["MCP", "EAP", "OKP_RC", "OKP_EXP", "OKP_PREMIUM", "OKP_FIDAE"] as const).flatMap((key) => {
                  const values = economics.byParking[key];
                  if (!values) return [];
                  const isOkp = key.startsWith("OKP_");
                  return [
                    <div className={`min-w-0 rounded-lg border border-l-2 px-2.5 py-2 ${isOkp ? "border-[#cce9dc] border-l-[#00a86b] bg-[#f8fcfa]" : "border-[#d6e4f2] border-l-[#2563a6] bg-[#f8fbfe]"}`} key={key}>
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-navy">{customerEconomicsParkingLabel(key)}</p><span className="text-[10px] text-slate-500">{displayCount(values.bookingCount)} boletas</span></div>
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                        <div><dt className="text-[10px] text-slate-500">Pagado</dt><dd className="text-xs font-medium text-navy">{displayClp(values.paidAmount)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">Valor promedio reserva</dt><dd className="text-xs font-medium text-navy">{displayClp(values.averageBoletaTicket)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">Lista</dt><dd className="text-xs font-medium text-navy">{displayClp(values.listAmount)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">ADR pagado / lista</dt><dd className="text-xs font-medium text-navy">{displayAdr(values.paidAdr)} · {displayAdr(values.listAdr)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">Descuento</dt><dd className="text-xs font-medium text-navy">{displayClp(values.discountAmount)} · {displayDiscountPercentage(values.weightedDiscountPct)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">Días económicos</dt><dd className="text-xs font-medium text-navy">{displayOptionalCount(values.economicDays)}</dd></div>
                        <div><dt className="text-[10px] text-slate-500">Con descuento</dt><dd className="text-xs font-medium text-navy">{displayCount(values.discountedBookingCount)} · {displayPercentage(values.discountUsagePct)}</dd></div>
                      </dl>
                    </div>,
                  ];
                })}
              </div>
            </div>
          ) : null}

          {economics.discountCodes.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-600">Códigos utilizados</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {economics.discountCodes.map((item) => <span className="rounded-full border border-[#d7e3ec] bg-white px-2 py-1 text-[10px] font-normal text-slate-600" key={`${item.source}-${item.code}`}>{item.source} · {item.code} · {displayCount(item.uses)} usos</span>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IdentityList({ emptyLabel, items }: { emptyLabel: string; items: string[] }) {
  return items.length > 0
    ? <ul className="mt-1 space-y-1">{items.map((item) => <li className="break-all text-xs font-normal text-navy" key={item}>{item}</li>)}</ul>
    : <p className="mt-1 text-xs text-slate-400">{emptyLabel}</p>;
}

function CustomerInformationPanel({ error, identities, loading, onBack, summary }: { error: string | null; identities: CustomerIdentities | null; loading: boolean; onBack: () => void; summary: CustomerSummary | null }) {
  const conflictTotal = identities
    ? identities.conflictCounts.emails + identities.conflictCounts.phones + identities.conflictCounts.plates
    : 0;

  return (
    <section aria-labelledby="customer-information-title">
      <SecondaryViewHeader onBack={onBack} title="Más información" />
      <h3 className="sr-only" id="customer-information-title">Más información</h3>
      {loading ? <p className="mt-3 text-xs text-slate-500">Cargando identidades...</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {identities?.ok ? (
        <div className="mt-3 space-y-3">
          {conflictTotal > 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800" role="status">{displayCount(conflictTotal)} {conflictTotal === 1 ? "identidad requiere" : "identidades requieren"} revisión</p> : null}
          <div className="grid gap-3 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-3 sm:grid-cols-2">
            <div><p className="text-[11px] text-slate-500">Emails confirmados ({displayCount(identities.confirmed.emails.length)})</p><IdentityList emptyLabel="Sin emails confirmados" items={identities.confirmed.emails} /></div>
            <div><p className="text-[11px] text-slate-500">Teléfonos confirmados ({displayCount(identities.confirmed.phones.length)})</p><IdentityList emptyLabel="Sin teléfonos confirmados" items={identities.confirmed.phones} /></div>
            <div><p className="text-[11px] text-slate-500">Patentes confirmadas ({displayCount(identities.confirmed.plates.length)})</p><IdentityList emptyLabel="Sin patentes confirmadas" items={identities.confirmed.plates} /></div>
            <div>
              <p className="text-[11px] text-slate-500">Patentes por confirmar ({displayCount(identities.pending.plates.length)})</p>
              {identities.pending.plates.length > 0 ? <ul className="mt-1 space-y-1.5">{identities.pending.plates.map((plate) => <li className="flex flex-wrap items-center gap-1.5" key={`${plate.value}-${plate.confidence}`}><span className="break-all text-xs text-navy">{plate.value}</span><ValueBadge tone="warning">Por confirmar</ValueBadge></li>)}</ul> : <p className="mt-1 text-xs text-slate-400">Sin patentes por confirmar</p>}
            </div>
          </div>
        </div>
      ) : null}
      {summary?.ok ? (
        <dl className="mt-3 grid gap-x-4 gap-y-2 rounded-lg border border-[#e4edf4] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {[["MCP", displayCount(summary.mcpCount)], ["EAP", displayCount(summary.eapCount)], ["OKP", displayCount(summary.okpCount)], ["Última marca", displayText(summary.lastBrand)], ["Último parking", displayText(summary.lastParking)]].map(([label, value]) => <div className="min-w-0" key={label as string}><dt className="text-[11px] font-normal text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-normal text-navy">{value}</dd></div>)}
        </dl>
      ) : null}
      {summary?.needsReview === true && conflictTotal === 0 ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800" role="status">Requiere revisión</p> : null}
    </section>
  );
}

function signalDescription(signal: CustomerCommercialSignal) {
  const evidence = signal.evidence;
  if (signal.signalKey === "PACK_CANDIDATE") {
    return `${displayCount(evidence.boletaCount)} boletas, ${displayCount(evidence.economicDays)} días económicos y ${displayCount(evidence.reservations12m)} compras en los últimos 12 meses.`;
  }
  if (signal.signalKey === "RECOVERABLE") {
    return `Recencia de ${displayCount(evidence.currentRecencyDays)} días, equivalente a ${displayDecimal(evidence.recencyRatio)} veces su intervalo mediano de ${displayCount(evidence.medianPurchaseIntervalDays)} días.`;
  }
  const boletaCount = displayCount(evidence.boletaCount);
  const discountedCount = displayCount(evidence.discountedBoletaCount);
  if (signal.signalKey === "PRICE_LIST_BUYER") {
    return `${boletaCount} boletas históricas sin uso de descuento.`;
  }
  return `${discountedCount} de ${boletaCount} boletas usaron descuento. Descuento ponderado: ${displayPercentage(evidence.weightedDiscountPct)}.`;
}

function CustomerSignalsPanel({ error, loading, onBack, signals }: { error: string | null; loading: boolean; onBack: () => void; signals: CustomerCommercialSignals | null }) {
  return (
    <section aria-labelledby="customer-signals-title">
      <SecondaryViewHeader onBack={onBack} title="Perfil de compra" />
      <h3 className="sr-only" id="customer-signals-title">Perfil de compra</h3>
      {loading ? <p className="mt-4 text-sm text-slate-600">Cargando perfil de compra...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {!loading && !error && signals?.ok ? (
        signals.signals.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {signals.signals.map((signal) => (
              <article className="rounded-lg border border-[#d7e3ec] bg-[#fbfcfd] px-3 py-3" key={signal.signalKey}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium text-navy">{signal.label}</h4>
                  <ValueBadge tone={signal.confidence === "HIGH" ? "success" : "warning"}>{signal.confidence}</ValueBadge>
                </div>
                <p className="mt-1.5 text-xs font-normal leading-5 text-slate-600">{signalDescription(signal)}</p>
              </article>
            ))}
          </div>
        ) : <div className="mt-4"><EmptyState description="Este cliente no tiene señales comerciales activas con evidencia suficiente." /></div>
      ) : null}
    </section>
  );
}

function RelatedReviewDrawer({ onClose, representation }: {
  onClose: () => void;
  representation: Extract<CustomerRepresentationListItemV2, { representationType: "related_review" }> | null;
}) {
  const [relatedView, setRelatedView] = useState<"main" | "contacts" | "purchase" | "information" | "resolve">("main");
  const [summary, setSummary] = useState<CustomerWindowRepresentationSummaryV2 | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryController = useRef<AbortController | null>(null);
  const [bookings, setBookings] = useState<CustomerWindowRepresentationBookingsResponseV2 | null>(null);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const bookingsController = useRef<AbortController | null>(null);
  const [identityDetail, setIdentityDetail] = useState<CustomerWindowIdentityResolutionDetailV2 | null>(null);
  const [identityDetailLoading, setIdentityDetailLoading] = useState(false);
  const [identityDetailError, setIdentityDetailError] = useState<string | null>(null);
  const identityDetailController = useRef<AbortController | null>(null);

  useEffect(() => {
    summaryController.current?.abort();
    identityDetailController.current?.abort();
    setRelatedView("main");
    setSummary(null);
    setSummaryError(null);
    setBookingsPage(1);
    setIdentityDetail(null);
    setIdentityDetailLoading(false);
    setIdentityDetailError(null);
    if (!representation) return;
    const controller = new AbortController();
    summaryController.current = controller;
    const params = new URLSearchParams({
      action: "summary-v2",
      representationId: representation.representationId,
      representationType: representation.representationType,
    });
    setSummaryLoading(true);
    void getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal)
      .then((body) => {
        if (summaryController.current !== controller) return;
        const nextSummary = normalizeCustomerWindowRepresentationSummaryV2(body);
        if (
          !nextSummary
          || nextSummary.representationType !== "related_review"
          || nextSummary.representationKey !== representation.representationKey
        ) throw new Error("Respuesta de resumen relacionado inválida.");
        setSummary(nextSummary);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (summaryController.current === controller) {
          setSummaryError(cause instanceof Error ? cause.message : "No fue posible cargar el resumen relacionado.");
        }
      })
      .finally(() => {
        if (summaryController.current === controller) setSummaryLoading(false);
      });
    return () => {
      controller.abort();
      identityDetailController.current?.abort();
    };
  }, [representation]);

  useEffect(() => {
    bookingsController.current?.abort();
    setBookings(null);
    setBookingsError(null);
    if (!representation) return;
    const controller = new AbortController();
    bookingsController.current = controller;
    const params = new URLSearchParams({
      action: "bookings-v2",
      page: String(bookingsPage),
      pageSize: String(TIMELINE_PAGE_SIZE),
      representationId: representation.representationId,
      representationType: representation.representationType,
    });
    setBookingsLoading(true);
    void getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal)
      .then((body) => {
        if (bookingsController.current !== controller) return;
        const nextBookings = normalizeCustomerWindowRepresentationBookingsResponseV2(body);
        if (!nextBookings || nextBookings.page !== bookingsPage || nextBookings.pageSize !== TIMELINE_PAGE_SIZE) {
          throw new Error("Respuesta de reservas relacionadas inválida.");
        }
        setBookings(nextBookings);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (bookingsController.current === controller) {
          setBookingsError(cause instanceof Error ? cause.message : "No fue posible cargar las reservas relacionadas.");
        }
      })
      .finally(() => {
        if (bookingsController.current === controller) setBookingsLoading(false);
      });
    return () => controller.abort();
  }, [bookingsPage, representation]);

  async function openIdentityResolution() {
    setRelatedView("resolve");
    if (identityDetail || identityDetailLoading || !representation) return;
    identityDetailController.current?.abort();
    const controller = new AbortController();
    identityDetailController.current = controller;
    const params = new URLSearchParams({
      action: "identity-resolution-detail-v2",
      relatedGroupId: representation.relatedGroupId,
      representationType: representation.representationType,
    });
    setIdentityDetailLoading(true);
    setIdentityDetailError(null);
    try {
      const body = await getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal);
      if (identityDetailController.current !== controller) return;
      const nextDetail = normalizeCustomerWindowIdentityResolutionDetailV2(body);
      if (!nextDetail || nextDetail.relatedGroupId !== representation.relatedGroupId) {
        throw new Error("Respuesta de resolución de identidad inválida.");
      }
      setIdentityDetail(nextDetail);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (identityDetailController.current === controller) {
        setIdentityDetailError(cause instanceof Error ? cause.message : "No fue posible cargar el historial de resolución.");
      }
    } finally {
      if (identityDetailController.current === controller) setIdentityDetailLoading(false);
    }
  }

  if (!representation) return null;
  const group = summary?.representationType === "related_review" ? summary.group : null;
  const relatedEmails = summary ? sortObservedContactsByLastSeen(summary.observedEmails) : [];
  const relatedPhones = summary ? sortObservedContactsByLastSeen(summary.observedPhones) : [];
  const latestObservedEmail = relatedEmails[0]?.value ?? null;
  const latestObservedPhone = relatedPhones[0]?.value ?? null;
  const relatedHeaderTitle = latestObservedEmail ?? latestObservedPhone ?? "Cliente relacionado";
  const relatedHeaderSubtitle = latestObservedEmail ? latestObservedPhone : null;
  const relatedEmailItems: CustomerContactDisplayItem[] = relatedEmails.map((contact) => ({
    meta: `${displaySafeCount(contact.bookingCount)} reservas · ${displayDate(contact.firstSeenAt)} a ${displayDate(contact.lastSeenAt)}`,
    value: contact.value,
  }));
  const relatedPhoneItems: CustomerContactDisplayItem[] = relatedPhones.map((contact) => ({
    meta: `${displaySafeCount(contact.bookingCount)} reservas · ${displayDate(contact.firstSeenAt)} a ${displayDate(contact.lastSeenAt)}`,
    value: contact.value,
  }));
  const pageCount = representationPageCount(bookings?.total ?? representation.totalReservations, TIMELINE_PAGE_SIZE);
  const groupMetrics = group ? [
    ["Perfiles relacionados", group.profileCount],
    ["Emails distintos", group.emailCount],
    ["Teléfonos distintos", group.phoneCount],
    ["Clientes de origen distintos", group.sourceCustomerCount],
    ["Conflictos", group.conflictCount],
    ["Candidatos", group.candidateCount],
    ["Reservas resueltas con V1", group.v1BookingCount],
    ["Reservas resueltas con V2", group.v2BookingCount],
  ] as const : [];
  const relatedTimelineItems: CustomerPurchaseTimelineItem[] = (bookings?.items ?? []).map((booking) => ({
    badge: booking.isPack ? "Pack" : "Boleta",
    badgeTone: booking.isPack ? "success" : "neutral",
    date: displayDate(booking.sourceCreatedAt),
    fields: [
      { label: "Llegada / salida", value: `${displayDate(booking.plannedArrivalAt)} · ${displayDate(booking.plannedDepartureAt)}` },
      { label: "Parking", value: booking.parking },
      { label: "Estado", value: booking.bookingStatus },
      { label: "Duración", value: booking.durationDays === null ? "No disponible" : `${displayCount(booking.durationDays)} días` },
      { label: "Email observado", value: booking.email ?? "—" },
      { label: "Teléfono observado", value: booking.phone ?? "—" },
      { label: "Monto", value: displayClp(booking.paidAmount) },
      { label: "Promoción", value: booking.promotionCode ?? "—" },
    ],
    key: booking.bookingLinkId,
    meta: <span className="text-slate-500">{booking.brand}</span>,
    sourceLabel: "MCP/EAP",
    sourceTone: "mcp",
  }));
  return (
    <CustomerRepresentationDrawerFrame badge="Relacionado / revisión" badgeTone="warning" label="Ficha de cliente relacionado" onClose={onClose} subtitle={relatedHeaderSubtitle} title={relatedHeaderTitle}>
        <div className="grid gap-5">
          <section>
            {summaryError ? <p className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">No fue posible cargar el resumen de esta representación.</p> : null}
            <CustomerSummaryMetrics fields={summary ? [
              { label: "Reservas históricas", value: displaySafeCount(summary.totalReservations) },
              { label: "Primera compra", value: displayDate(summary.firstPurchaseAt) },
              { label: "Última compra", value: displayDate(summary.lastPurchaseAt) },
              { label: "Emails observados", value: displaySafeCount(summary.contactSummary.emailCount) },
              { label: "Teléfonos observados", value: displaySafeCount(summary.contactSummary.phoneCount) },
              { label: "Identidad", value: <ValueBadge tone="warning">En revisión</ValueBadge> },
            ] : []} loading={summaryLoading} />
          </section>

          {relatedView === "main" ? <CustomerContactOverview emailItems={relatedEmailItems} emailTotal={summary?.contactSummary.emailCount ?? 0} loading={summaryLoading} phoneItems={relatedPhoneItems} phoneTotal={summary?.contactSummary.phoneCount ?? 0} semantics="Observado" /> : null}

          {relatedView === "main" ? <CustomerDrawerActions actions={[{ label: "Contactos", onClick: () => setRelatedView("contacts") }, { label: "Perfil de compra", onClick: () => setRelatedView("purchase") }, { label: "Más información", onClick: () => setRelatedView("information") }, { label: "Resolver identidad", onClick: () => void openIdentityResolution() }]} label="Acciones de la ficha" /> : null}

          {relatedView === "main" ? <CustomerPurchaseTimeline emptyDescription="No hay reservas para mostrar." error={bookingsError ? "No fue posible cargar las reservas de esta representación." : null} items={relatedTimelineItems} loading={bookingsLoading} onNext={() => setBookingsPage(bookingsPage + 1)} onPrevious={() => setBookingsPage(bookingsPage - 1)} page={bookingsPage} pageCount={pageCount} total={Number(bookings?.total ?? 0)} /> : null}

          {relatedView === "contacts" ? <section aria-labelledby="related-contacts-title" className="mt-5" id="related-contacts-panel"><SecondaryViewHeader onBack={() => setRelatedView("main")} title="Contactos" /><h3 className="mt-4 text-sm font-medium text-slate-700" id="related-contacts-title">Contactos observados</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">Estos datos fueron observados en las reservas relacionadas. No se ha definido un contacto principal mientras la identidad permanezca en revisión.</p>{summaryLoading ? <p className="mt-3 text-xs text-slate-500">Cargando contactos observados...</p> : null}{summaryError ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">No fue posible cargar los contactos observados.</p> : null}{summary ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-3"><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-medium text-navy">Emails observados</h4><span className="text-[11px] text-slate-500">{displaySafeCount(summary.contactSummary.emailCount)}</span></div>{summary.observedEmails.length > 0 ? <ul className="mt-2 max-h-72 divide-y divide-[#e4edf4] overflow-y-auto overscroll-contain pr-1">{summary.observedEmails.map((contact) => <li className="min-w-0 py-2 first:pt-0 last:pb-0" key={contact.value}><p className="break-all text-xs text-slate-700">{contact.value}</p><p className="mt-0.5 text-[11px] text-slate-500">{displaySafeCount(contact.bookingCount)} reservas · {displayDate(contact.firstSeenAt)} a {displayDate(contact.lastSeenAt)}</p></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Sin email observado.</p>}</div><div className="min-w-0 rounded-lg border border-[#e4edf4] px-3 py-3"><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-medium text-navy">Teléfonos observados</h4><span className="text-[11px] text-slate-500">{displaySafeCount(summary.contactSummary.phoneCount)}</span></div>{summary.observedPhones.length > 0 ? <ul className="mt-2 max-h-72 divide-y divide-[#e4edf4] overflow-y-auto overscroll-contain pr-1">{summary.observedPhones.map((contact) => <li className="min-w-0 py-2 first:pt-0 last:pb-0" key={contact.value}><p className="break-all text-xs text-slate-700">{contact.value}</p><p className="mt-0.5 text-[11px] text-slate-500">{displaySafeCount(contact.bookingCount)} reservas · {displayDate(contact.firstSeenAt)} a {displayDate(contact.lastSeenAt)}</p></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Sin teléfono observado.</p>}</div></div> : null}</section> : null}

          {relatedView === "purchase" ? <section aria-labelledby="related-purchase-title" className="mt-5" id="related-purchase-panel"><SecondaryViewHeader onBack={() => setRelatedView("main")} title="Perfil de compra" /><h3 className="sr-only" id="related-purchase-title">Perfil de compra</h3>{summaryLoading ? <p className="mt-4 text-xs text-slate-500">Cargando perfil de compra...</p> : null}{summaryError ? <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">No fue posible cargar el perfil de compra.</p> : null}{summary ? <dl className="mt-4 grid gap-x-4 gap-y-3 rounded-lg border border-[#e4edf4] bg-[#fbfcfd] px-3 py-3 sm:grid-cols-2"><div><dt className="text-[11px] text-slate-500">Reservas históricas</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displaySafeCount(summary.totalReservations)}</dd></div><div><dt className="text-[11px] text-slate-500">Período observado</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displayDate(summary.firstPurchaseAt)} a {displayDate(summary.lastPurchaseAt)}</dd></div></dl> : null}</section> : null}

          {relatedView === "information" ? <section aria-labelledby="related-information-title" className="mt-5" id="related-information-panel"><SecondaryViewHeader onBack={() => setRelatedView("main")} title="Más información" /><h3 className="sr-only" id="related-information-title">Más información</h3>{summaryLoading ? <p className="mt-3 text-xs text-slate-500">Cargando información...</p> : null}{summaryError ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">No fue posible cargar la información de esta representación.</p> : null}{group ? <><h4 className="mt-4 text-xs font-medium text-navy">Composición del grupo</h4><dl className="mt-2 grid gap-x-4 gap-y-2 rounded-lg border border-[#e4edf4] px-3 py-3 sm:grid-cols-2">{groupMetrics.map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-medium text-navy">{displaySafeCount(value)}</dd></div>)}</dl><h4 className="mt-4 text-xs font-medium text-navy">Corroboraciones</h4><div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="flex items-center justify-between gap-3 rounded-lg border border-[#e4edf4] px-3 py-2 text-xs text-slate-600"><span>Coincidencia email + teléfono</span><ValueBadge tone={group.hasExactEmailPhoneCorroboration ? "success" : "neutral"}>{group.hasExactEmailPhoneCorroboration ? "Sí" : "No"}</ValueBadge></div><div className="flex items-center justify-between gap-3 rounded-lg border border-[#e4edf4] px-3 py-2 text-xs text-slate-600"><span>Coincidencia cliente de origen + email</span><ValueBadge tone={group.hasSourceCustomerEmailCorroboration ? "success" : "neutral"}>{group.hasSourceCustomerEmailCorroboration ? "Sí" : "No"}</ValueBadge></div></div></> : null}<div className="mt-5"><h4 className="text-xs font-medium text-navy">Revisión de identidad</h4><p className="mt-1.5 text-xs leading-5 text-slate-600">En una etapa posterior este grupo podrá revisarse para confirmar si corresponde a una misma persona o debe mantenerse separado.</p></div></section> : null}

          {relatedView === "resolve" ? <CustomerIdentityResolutionPanel detail={identityDetail} detailError={identityDetailError} detailLoading={identityDetailLoading} group={group} loading={summaryLoading} onBack={() => setRelatedView("main")} onRetry={() => void openIdentityResolution()} timeline={<CustomerPurchaseTimeline emptyDescription="No hay reservas para mostrar." error={bookingsError ? "No fue posible cargar las reservas de esta representación." : null} items={relatedTimelineItems} loading={bookingsLoading} onNext={() => setBookingsPage(bookingsPage + 1)} onPrevious={() => setBookingsPage(bookingsPage - 1)} page={bookingsPage} pageCount={pageCount} total={Number(bookings?.total ?? 0)} />} /> : null}
        </div>
    </CustomerRepresentationDrawerFrame>
  );
}

function CustomerDetailDrawer({
  customerId,
  economics,
  economicsError,
  economicsLoading,
  error,
  loading,
  onClose,
  onPageChange,
  representation,
  summary,
  timeline,
  timelinePage,
}: {
  customerId: string | null;
  economics: CustomerEconomics | null;
  economicsError: string | null;
  economicsLoading: boolean;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onPageChange: (page: number) => void;
  representation: Extract<CustomerRepresentationListItemV2, { representationType: "confirmed_customer" }> | null;
  summary: CustomerSummary | null;
  timeline: Timeline | null;
  timelinePage: number;
}) {
  const timelinePageCount = Math.max(1, Math.ceil((timeline?.total ?? 0) / TIMELINE_PAGE_SIZE));
  const [detailView, setDetailView] = useState<"main" | "contacts" | "economics" | "signals" | "information">("main");
  const [signals, setSignals] = useState<CustomerCommercialSignals | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const signalsController = useRef<AbortController | null>(null);
  const [identities, setIdentities] = useState<CustomerIdentities | null>(null);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [identitiesError, setIdentitiesError] = useState<string | null>(null);
  const identitiesController = useRef<AbortController | null>(null);

  useEffect(() => {
    identitiesController.current?.abort();
    signalsController.current?.abort();
    setDetailView("main");
    setSignals(null);
    setSignalsError(null);
    setSignalsLoading(false);
    setIdentities(null);
    setIdentitiesError(null);
    setIdentitiesLoading(false);
  }, [customerId]);

  async function openSignals() {
    setDetailView("signals");
    if (signals || signalsLoading || !customerId) return;
    signalsController.current?.abort();
    const controller = new AbortController();
    signalsController.current = controller;
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const nextSignals = await getJson(`/api/orquestador/customer-window/customers?action=signals&customerId=${customerId}`, controller.signal);
      if (signalsController.current === controller) setSignals(nextSignals as CustomerCommercialSignals);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (signalsController.current === controller) setSignalsError(cause instanceof Error ? cause.message : "No fue posible cargar el perfil de compra.");
    } finally {
      if (signalsController.current === controller) setSignalsLoading(false);
    }
  }

  async function openIdentities(view: "contacts" | "information") {
    setDetailView(view);
    if (identities || identitiesLoading || !customerId) return;
    identitiesController.current?.abort();
    const controller = new AbortController();
    identitiesController.current = controller;
    setIdentitiesLoading(true);
    setIdentitiesError(null);
    try {
      const nextIdentities = await getJson(`/api/orquestador/customer-window/customers?action=identities&customerId=${customerId}`, controller.signal);
      if (identitiesController.current === controller) setIdentities(nextIdentities as CustomerIdentities);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (identitiesController.current === controller) setIdentitiesError(cause instanceof Error ? cause.message : "No fue posible cargar las identidades del cliente.");
    } finally {
      if (identitiesController.current === controller) setIdentitiesLoading(false);
    }
  }

  if (!customerId) return null;

  const primaryIdentity = representation?.contactSummary.singleEmail
    ?? representation?.contactSummary.singlePhone
    ?? "Cliente confirmado";
  const secondaryIdentity = representation?.contactSummary.singleEmail
    ? representation.contactSummary.singlePhone
    : null;
  const directEmailItems: CustomerContactDisplayItem[] = identities?.ok
    ? identities.confirmed.emails.map((value) => ({ value }))
    : representation?.contactSummary.singleEmail ? [{ value: representation.contactSummary.singleEmail }] : [];
  const directPhoneItems: CustomerContactDisplayItem[] = identities?.ok
    ? identities.confirmed.phones.map((value) => ({ value }))
    : representation?.contactSummary.singlePhone ? [{ value: representation.contactSummary.singlePhone }] : [];
  const directEmailTotal = identities?.ok ? identities.confirmed.emails.length : representation?.contactSummary.emailCount ?? 0;
  const directPhoneTotal = identities?.ok ? identities.confirmed.phones.length : representation?.contactSummary.phoneCount ?? 0;
  const confirmedTimelineItems: CustomerPurchaseTimelineItem[] = (timeline?.items ?? []).map((booking) => {
    const isOkpBooking = booking.source === "OKP";
    const showEconomics = booking.is_pack === false
      && booking.economic_eligible === true
      && booking.economics_available === true;
    const fields: CustomerPurchaseTimelineItem["fields"] = [
      { label: "Parking", value: displayText(booking.parking) },
      { label: "Estado", value: displayText(booking.status) },
      { label: "Llegada / salida", value: `${displayDate(booking.planned_arrival_at)} · ${displayDate(booking.planned_departure_at)}` },
      { label: "Duración", value: booking.duration_days === null ? "No disponible" : `${displayCount(booking.duration_days)} días` },
    ];
    if (showEconomics) fields.push(
      { label: "Precio pagado", value: displayClp(booking.paid_amount) },
      { label: "Precio lista", value: displayClp(booking.list_amount) },
      { label: "Descuento $", value: displayClp(booking.discount_amount) },
      { label: "Descuento %", value: displayDiscountPercentage(booking.discount_percentage) },
      { label: "ADR pagado", value: displayAdr(booking.paid_adr) },
      { label: "ADR lista", value: displayAdr(booking.list_adr) },
    );
    return {
      badge: booking.is_pack ? "Pack" : "Boleta",
      badgeTone: booking.is_pack ? "success" : "neutral",
      date: displayDate(booking.purchase_created_at),
      fields,
      key: `${booking.source}-${booking.source_row_id}`,
      meta: showEconomics ? <span className="font-medium text-navy">{displayClp(booking.paid_amount)}</span> : null,
      sourceLabel: `${isOkpBooking ? "OKP" : displayText(booking.brand, "MCP/EAP")} · ${displayText(booking.source_booking_code)}`,
      sourceTone: isOkpBooking ? "okp" : "mcp",
    };
  });

  return (
    <CustomerRepresentationDrawerFrame badge="Confirmado" badgeTone="success" label="Ficha de cliente confirmado" onClose={onClose} subtitle={secondaryIdentity} title={primaryIdentity}>
        <div className="relative overflow-clip">
          <div aria-hidden={detailView !== "main"} className={`grid gap-4 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${detailView === "main" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-4 top-4 -translate-x-4 opacity-0"}`} inert={detailView !== "main"}>
          {loading && !summary ? <p className="text-sm text-slate-600">Cargando detalle...</p> : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <CustomerSummaryMetrics fields={summary?.ok ? [
            { label: "Reservas históricas", value: displayCount(summary.purchaseCount) },
            { label: "Primera compra", value: displayDate(summary.firstPurchaseAt) },
            { label: "Última compra", value: displayDate(summary.lastPurchaseAt) },
            { label: "Packs / Boletas", value: `${displayCount(summary.packCount)} / ${displayCount(summary.nonPackCount)}` },
            { label: "Gasto histórico", value: economics?.ok ? displayClp(economics.total.paidAmount) : economicsLoading ? "Cargando..." : "No disponible" },
            { label: "Identidad", value: <ValueBadge tone="success">Confirmada</ValueBadge> },
          ] : []} loading={loading && !summary} />

          {summary?.ok ? <CustomerContactOverview emailItems={directEmailItems} emailTotal={directEmailTotal} phoneItems={directPhoneItems} phoneTotal={directPhoneTotal} semantics="Directo" /> : null}

          {summary?.ok ? (
            <CustomerDrawerActions actions={[{ label: "Contactos", onClick: () => void openIdentities("contacts") }, { label: "Perfil de compra", onClick: () => void openSignals() }, { label: "Más información", onClick: () => void openIdentities("information") }, { label: "Economía", onClick: () => setDetailView("economics") }]} label="Acciones de la ficha" />
          ) : null}

          {summary?.ok ? <CustomerPurchaseTimeline emptyDescription="Este cliente no tiene compras confirmadas para mostrar." error={error} items={confirmedTimelineItems} loading={loading} onNext={() => onPageChange(timelinePage + 1)} onPrevious={() => onPageChange(timelinePage - 1)} page={timelinePage} pageCount={timelinePageCount} total={timeline?.total ?? 0} /> : null}
          </div>
          <div aria-hidden={detailView !== "contacts"} className={`transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${detailView === "contacts" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-4 top-4 translate-x-6 opacity-0"}`} inert={detailView !== "contacts"}>
            <section aria-labelledby="customer-direct-contacts-title"><SecondaryViewHeader onBack={() => setDetailView("main")} title="Contactos" /><h3 className="mt-4 text-sm font-medium text-slate-700" id="customer-direct-contacts-title">Contactos directos</h3>{identitiesLoading ? <p className="mt-3 text-xs text-slate-500">Cargando contactos...</p> : null}{identitiesError ? <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">No fue posible cargar los contactos.</p> : null}{identities?.ok ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-[#e4edf4] px-3 py-3"><p className="text-[11px] text-slate-500">Emails directos ({displayCount(identities.confirmed.emails.length)})</p><IdentityList emptyLabel="Sin emails confirmados" items={identities.confirmed.emails} /></div><div className="rounded-lg border border-[#e4edf4] px-3 py-3"><p className="text-[11px] text-slate-500">Teléfonos directos ({displayCount(identities.confirmed.phones.length)})</p><IdentityList emptyLabel="Sin teléfonos confirmados" items={identities.confirmed.phones} /></div></div> : null}</section>
          </div>
          <div aria-hidden={detailView !== "economics"} className={`transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${detailView === "economics" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-4 top-4 translate-x-6 opacity-0"}`} inert={detailView !== "economics"}>
            <CustomerEconomicsPanel economics={economics} error={economicsError} loading={economicsLoading} onBack={() => setDetailView("main")} />
          </div>
          <div aria-hidden={detailView !== "signals"} className={`transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${detailView === "signals" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-4 top-4 translate-x-6 opacity-0"}`} inert={detailView !== "signals"}>
            <CustomerSignalsPanel error={signalsError} loading={signalsLoading} onBack={() => setDetailView("main")} signals={signals} />
          </div>
          <div aria-hidden={detailView !== "information"} className={`transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${detailView === "information" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-4 top-4 translate-x-6 opacity-0"}`} inert={detailView !== "information"}>
            <CustomerInformationPanel error={identitiesError} identities={identities} loading={identitiesLoading} onBack={() => setDetailView("main")} summary={summary} />
          </div>
        </div>
    </CustomerRepresentationDrawerFrame>
  );
}

export function CustomerWindowView() {
  const initialRange = useRef(getCustomerPeriodRange("today", getSantiagoDateKey()));
  const [section, setSection] = useState<"clientes" | "campanas">("clientes");
  const [periodPreset, setPeriodPreset] = useState<CustomerPeriodPreset>("today");
  const [periodRange, setPeriodRange] = useState<CustomerPeriodRange>(initialRange.current);
  const [representationPage, setRepresentationPage] = useState(1);
  const [representationList, setRepresentationList] = useState<RepresentationPeriodListV2>(emptyRepresentationList);
  const [representationLoading, setRepresentationLoading] = useState(false);
  const [representationError, setRepresentationError] = useState<string | null>(null);
  const representationController = useRef<AbortController | null>(null);
  const representationRequest = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<CustomerWindowRepresentationSearchV2 | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const facetsController = useRef<AbortController | null>(null);
  const facetsRequest = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const [periodFacets, setPeriodFacets] = useState<CustomerWindowPeriodFacetsV2 | null>(null);
  const [periodFacetsLoading, setPeriodFacetsLoading] = useState(false);
  const [periodFacetsError, setPeriodFacetsError] = useState<string | null>(null);
  const refreshHealthController = useRef<AbortController | null>(null);
  const [refreshHealth, setRefreshHealth] = useState<CustomerWindowRefreshHealth | null>(null);
  const [refreshHealthLoading, setRefreshHealthLoading] = useState(false);
  const [refreshHealthError, setRefreshHealthError] = useState(false);
  const refreshHealthStatus = useRef<CustomerWindowRefreshHealth["status"] | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteria, setCriteria] = useState<ClassificationCriteria | null>(null);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [drawerCustomerId, setDrawerCustomerId] = useState<string | null>(null);
  const [selectedRepresentation, setSelectedRepresentation] = useState<CustomerRepresentationListItemV2 | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [economics, setEconomics] = useState<CustomerEconomics | null>(null);
  const [economicsLoading, setEconomicsLoading] = useState(false);
  const [economicsError, setEconomicsError] = useState<string | null>(null);
  const economicsController = useRef<AbortController | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRepresentations = useCallback((page: number) => {
    const requestKey = `${periodRange.from}:${periodRange.to}:${page}`;
    if (representationRequest.current?.key === requestKey) return representationRequest.current.promise;
    representationController.current?.abort();
    const controller = new AbortController();
    representationController.current = controller;
    const params = new URLSearchParams({
      action: "list-by-period-v2",
      from: periodRange.from,
      page: String(page),
      pageSize: String(PERIOD_PAGE_SIZE),
      to: periodRange.to,
    });
    const promise = (async () => {
      setRepresentationLoading(true);
      setRepresentationError(null);
      try {
        const body = await getCustomerWindowJsonWithRetry(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal);
        if (representationController.current !== controller) return;
        const nextList = normalizeRepresentationListForUi(body);
        if (!nextList) throw new Error("Respuesta de representaciones inválida.");
        setRepresentationList(nextList);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (representationController.current === controller) {
          setRepresentationError(cause instanceof Error ? cause.message : "No fue posible cargar las representaciones.");
        }
      } finally {
        if (representationController.current === controller) setRepresentationLoading(false);
      }
    })();
    representationRequest.current = { key: requestKey, promise };
    void promise.then(() => {
      if (representationRequest.current?.promise === promise) representationRequest.current = null;
    });
    return promise;
  }, [periodRange.from, periodRange.to]);

  const loadPeriodFacets = useCallback(() => {
    const requestKey = `${periodRange.from}:${periodRange.to}`;
    if (facetsRequest.current?.key === requestKey) return facetsRequest.current.promise;
    facetsController.current?.abort();
    const controller = new AbortController();
    facetsController.current = controller;
    const params = new URLSearchParams({
      action: "period-facets-v2",
      from: periodRange.from,
      to: periodRange.to,
    });
    const promise = (async () => {
      setPeriodFacetsLoading(true);
      setPeriodFacetsError(null);
      try {
        const body = await getCustomerWindowJsonWithRetry(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal);
        if (facetsController.current !== controller) return;
        const nextFacets = normalizeCustomerWindowPeriodFacetsV2(body);
        if (!nextFacets) throw new Error("Respuesta de facetas inválida.");
        setPeriodFacets(nextFacets);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (facetsController.current === controller) {
          setPeriodFacetsError(cause instanceof Error ? cause.message : "No fue posible cargar los conteos.");
        }
      } finally {
        if (facetsController.current === controller) setPeriodFacetsLoading(false);
      }
    })();
    facetsRequest.current = { key: requestKey, promise };
    void promise.then(() => {
      if (facetsRequest.current?.promise === promise) facetsRequest.current = null;
    });
    return promise;
  }, [periodRange.from, periodRange.to]);

  const loadRefreshHealth = useCallback(async () => {
    refreshHealthController.current?.abort();
    const controller = new AbortController();
    refreshHealthController.current = controller;
    setRefreshHealthLoading(true);
    try {
      const body = await getJson(
        "/api/orquestador/customer-window/customers?action=refresh-health",
        controller.signal,
      );
      if (refreshHealthController.current !== controller) return;
      const nextHealth = normalizeCustomerWindowRefreshHealth(body);
      if (!nextHealth) throw new Error("Respuesta de estado inválida.");
      const previousStatus = refreshHealthStatus.current;
      refreshHealthStatus.current = nextHealth.status;
      setRefreshHealth(nextHealth);
      setRefreshHealthError(false);
      if (previousStatus === "refreshing" && nextHealth.status === "healthy") {
        void Promise.allSettled([loadPeriodFacets(), loadRepresentations(representationPage)]);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (refreshHealthController.current === controller) setRefreshHealthError(true);
    } finally {
      if (refreshHealthController.current === controller) setRefreshHealthLoading(false);
    }
  }, [loadPeriodFacets, loadRepresentations, representationPage]);

  const closeCustomerDrawer = useCallback(() => {
    economicsController.current?.abort();
    setDrawerCustomerId(null);
    setSelectedRepresentation(null);
    setEconomics(null);
    setEconomicsError(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (section !== "clientes") return;
    void loadRepresentations(representationPage);
    const controller = representationController.current;
    return () => controller?.abort();
  }, [loadRepresentations, representationPage, section]);

  useEffect(() => {
    if (section !== "clientes") return;
    void loadPeriodFacets();
    const controller = facetsController.current;
    return () => controller?.abort();
  }, [loadPeriodFacets, section]);

  useEffect(() => {
    if (section !== "clientes") return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadRefreshHealth();
    };
    refreshIfVisible();
    const interval = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      refreshHealthController.current?.abort();
    };
  }, [loadRefreshHealth, section]);

  useEffect(() => {
    searchController.current?.abort();
    const query = searchQuery.trim();
    if (section !== "clientes" || query.length < 2) {
      setSearchResult(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      searchController.current = controller;
      const params = new URLSearchParams({ action: "search-v2", limit: "20", query });
      setSearchLoading(true);
      setSearchError(null);
      void getJson(`/api/orquestador/customer-window/customers?${params.toString()}`, controller.signal)
        .then((body) => {
          if (searchController.current !== controller) return;
          const normalized = normalizeCustomerWindowRepresentationSearchV2(body);
          if (!normalized) throw new Error("Respuesta de búsqueda inválida.");
          setSearchResult(normalized);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          if (searchController.current === controller) {
            setSearchError(cause instanceof Error ? cause.message : "No fue posible buscar representaciones.");
          }
        })
        .finally(() => {
          if (searchController.current === controller) setSearchLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      searchController.current?.abort();
    };
  }, [searchQuery, section]);

  useEffect(() => {
    if (!drawerCustomerId && selectedRepresentation?.representationType !== "related_review") return;
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
  }, [closeCustomerDrawer, drawerCustomerId, selectedRepresentation]);

  function abortRepresentationRequests() {
    representationController.current?.abort();
    facetsController.current?.abort();
    setPeriodFacets(null);
    setPeriodFacetsError(null);
  }

  function applyPeriod(preset: CustomerPeriodPreset, range: CustomerPeriodRange) {
    abortRepresentationRequests();
    setPeriodPreset(preset);
    setPeriodRange(range);
    setRepresentationPage(1);
    setSelectedRepresentation(null);
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

  async function selectCustomer(customerId: string) {
    setDrawerCustomerId(customerId);
    setLoading(true); setError(null); setSummary(null); setTimeline(null); setTimelinePage(1);
    economicsController.current?.abort();
    const controller = new AbortController();
    economicsController.current = controller;
    setEconomics(null); setEconomicsError(null); setEconomicsLoading(true);
    void getJson(`/api/orquestador/customer-window/customers?action=economics&customerId=${customerId}`, controller.signal)
      .then((nextEconomics) => {
        if (economicsController.current === controller) setEconomics(nextEconomics as CustomerEconomics);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (economicsController.current === controller) setEconomicsError(cause instanceof Error ? cause.message : "No fue posible cargar la economía del cliente.");
      })
      .finally(() => {
        if (economicsController.current === controller) setEconomicsLoading(false);
      });
    try {
      const [nextSummary, nextTimeline] = await Promise.all([
        getJson(`/api/orquestador/customer-window/customers?action=summary&customerId=${customerId}`),
        getJson(`/api/orquestador/customer-window/customers?action=bookings&customerId=${customerId}&page=1&pageSize=${TIMELINE_PAGE_SIZE}`),
      ]);
      setSummary(nextSummary); setTimeline(nextTimeline);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar el cliente."); }
    finally { setLoading(false); }
  }

  function selectRepresentation(representation: CustomerRepresentationListItemV2) {
    setSelectedRepresentation(representation);
    if (representation.representationType === "related_review") {
      economicsController.current?.abort();
      setDrawerCustomerId(null);
      setSummary(null);
      setTimeline(null);
      setEconomics(null);
      setEconomicsError(null);
      setError(null);
      return;
    }
    void selectCustomer(representation.customerId);
  }

  function selectSearchRepresentation(item: CustomerWindowRepresentationSearchItemV2) {
    if (item.representationType === "confirmed_customer" && item.customerId && item.relatedGroupId === null && item.metricScope === "all_confirmed_sources") {
      selectRepresentation({ ...item, customerId: item.customerId, metricScope: "all_confirmed_sources", relatedGroupId: null, representationType: "confirmed_customer" });
    } else if (item.representationType === "related_review" && item.customerId === null && item.relatedGroupId && item.metricScope === "mcp_eap_active_snapshot") {
      selectRepresentation({ ...item, customerId: null, metricScope: "mcp_eap_active_snapshot", relatedGroupId: item.relatedGroupId, representationType: "related_review" });
    }
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

  const relatedRepresentation = selectedRepresentation?.representationType === "related_review"
    ? selectedRepresentation
    : null;
  const confirmedRepresentation = selectedRepresentation?.representationType === "confirmed_customer"
    ? selectedRepresentation
    : null;

  return (
    <section className="mt-5">
      <div className="flex gap-2 border-b border-[#d6e1ea]" role="tablist" aria-label="Customer Window">{(["clientes", "campanas"] as const).map((value) => <button aria-selected={section === value} className={`border-b-2 px-4 py-3 text-sm font-semibold ${section === value ? "border-sea text-navy" : "border-transparent text-slate-500"}`} key={value} onClick={() => setSection(value)} role="tab" type="button">{value === "clientes" ? "Clientes" : "Campañas"}</button>)}</div>
      {section === "campanas" ? <Panel title="Campañas"><p className="mt-4 text-sm text-slate-600">Próximamente.</p></Panel> : (
        <>
          <section aria-label="Buscar representaciones" className="mt-5 border-y border-[#d6e1ea] bg-white px-5 py-4">
            <label className="text-xs font-medium text-slate-600" htmlFor="customer-window-v2-search">Buscar clientes</label>
            <div className="relative mt-2"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoComplete="off" className="w-full rounded-lg border border-[#cbd8e3] py-2.5 pl-9 pr-3 text-sm text-navy outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-sea/20" id="customer-window-v2-search" maxLength={128} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar por email, teléfono, reserva o cliente..." type="search" value={searchQuery} /></div>
            <CustomerRepresentationSearchResults error={searchError} loading={searchLoading} onSelect={selectSearchRepresentation} query={searchQuery} result={searchResult} />
          </section>
          <section aria-label="Filtros de clientes" className="relative z-20 mt-5 overflow-visible rounded-xl border border-[#d6e1ea] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
            <CustomerPeriodSelector onApply={applyPeriod} preset={periodPreset} range={periodRange} />
          </section>
          <CustomerWindowRefreshHealthStrip error={refreshHealthError} health={refreshHealth} loading={refreshHealthLoading} />
          <CustomerRepresentationFacets error={periodFacetsError} facets={periodFacets} loading={periodFacetsLoading} />
          <CustomerRepresentationTable error={representationError} list={representationList} loading={representationLoading} onPageChange={setRepresentationPage} onSelectRepresentation={selectRepresentation} />
          <Panel action={<button aria-controls="customer-window-classification-criteria" aria-expanded={criteriaOpen} className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] px-3 py-2 text-sm font-semibold text-navy hover:border-sea" onClick={toggleCriteria} type="button">{criteriaOpen ? "Ocultar" : "Mostrar"}{criteriaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>} description="Consulta las reglas oficiales utilizadas por el modelo comercial." title="Criterios de clasificación"><div id="customer-window-classification-criteria">{criteriaOpen && criteriaLoading ? <p className="mt-4 text-sm text-slate-600">Cargando criterios...</p> : null}{criteriaOpen && criteriaError ? <p className="mt-4 text-sm text-red-700" role="alert">{criteriaError}</p> : null}{criteriaOpen && criteria ? <ClassificationCriteriaContent criteria={criteria} /> : null}</div></Panel>
        </>
      )}
      <RelatedReviewDrawer key={relatedRepresentation?.representationKey ?? "related-review-closed"} onClose={closeCustomerDrawer} representation={relatedRepresentation} />
      <CustomerDetailDrawer customerId={drawerCustomerId} economics={economics} economicsError={economicsError} economicsLoading={economicsLoading} error={error} loading={loading} onClose={closeCustomerDrawer} onPageChange={changeTimelinePage} representation={confirmedRepresentation} summary={summary} timeline={timeline} timelinePage={timelinePage} />
    </section>
  );
}
