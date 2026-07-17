import {
  CheckCircle2,
  Clock3,
  DollarSign,
  Eye,
  MessageCircle,
  MousePointerClick,
  ShoppingCart,
} from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { getRecoveryAttributionKpis, getRecoveryImportHistory } from "@/lib/dashboard/data";
import { IncompleteBookingsUploadMock } from "./incomplete-bookings-upload-mock";
import { PurchasesUploadMock } from "./purchases-upload-mock";
import { RecoveryAttributionKpis } from "./recovery-attribution-kpis";
import { RecoveryImportHistory } from "./recovery-import-history";

const kpis = [
  { label: "Carritos perdidos", value: "128", icon: ShoppingCart, tone: "info" as BadgeTone },
  { label: "WhatsApps enviados", value: "104", icon: MessageCircle, tone: "info" as BadgeTone },
  { label: "Entregados", value: "91", icon: CheckCircle2, tone: "success" as BadgeTone },
  { label: "Leídos", value: "68", icon: Eye, tone: "success" as BadgeTone },
  { label: "Respondidos", value: "24", icon: MousePointerClick, tone: "warning" as BadgeTone },
  { label: "Compras recuperadas", value: "17", icon: ShoppingCart, tone: "success" as BadgeTone },
  { label: "Ingresos recuperados", value: "$1.240.000", icon: DollarSign, tone: "success" as BadgeTone },
];

const funnel = [
  { label: "Carrito perdido", value: 128 },
  { label: "Enviado", value: 104 },
  { label: "Entregado", value: 91 },
  { label: "Leído", value: 68 },
  { label: "Respondió", value: 24 },
  { label: "Compró", value: 17 },
];

const cases = [
  {
    amount: "$84.000",
    boughtAfter: "Sí",
    cartDate: "2026-07-10 09:42",
    client: "Cliente Demo 1",
    confidence: "Alta",
    email: "cliente***@demo.cl",
    intent: "Precio",
    phone: "+56 9 **** 1234",
    response: "Respondió",
    status: "Leído",
    type: "abandoned",
  },
  {
    amount: "$0",
    boughtAfter: "No",
    cartDate: "2026-07-10 11:15",
    client: "Cliente Demo 2",
    confidence: "Media",
    email: "contacto***@demo.cl",
    intent: "Duda traslado",
    phone: "+56 9 **** 7788",
    response: "Sin respuesta",
    status: "Entregado",
    type: "canceled",
  },
  {
    amount: "$126.000",
    boughtAfter: "Sí",
    cartDate: "2026-07-11 16:08",
    client: "Cliente Demo 3",
    confidence: "Alta",
    email: "reserva***@demo.cl",
    intent: "Pago",
    phone: "+56 9 **** 4412",
    response: "Respondió",
    status: "Leído",
    type: "abandoned",
  },
  {
    amount: "$0",
    boughtAfter: "No",
    cartDate: "2026-07-12 08:31",
    client: "Cliente Demo 4",
    confidence: "Baja",
    email: "viaje***@demo.cl",
    intent: "Cambio de viaje",
    phone: "+56 9 **** 9021",
    response: "No entregado",
    status: "No entregado",
    type: "canceled",
  },
  {
    amount: "$72.000",
    boughtAfter: "Sí",
    cartDate: "2026-07-12 19:04",
    client: "Cliente Demo 5",
    confidence: "Media",
    email: "demo***@demo.cl",
    intent: "Solo cotizaba",
    phone: "+56 9 **** 3366",
    response: "Respondió",
    status: "Leído",
    type: "abandoned",
  },
];

const reasons = [
  { label: "Precio", value: 9 },
  { label: "Problema de pago", value: 6 },
  { label: "Duda sobre traslado", value: 5 },
  { label: "Cambio de viaje", value: 4 },
  { label: "Solo cotizaba", value: 8 },
  { label: "Sin respuesta", value: 80 },
];

const recoveredPurchases = [
  { client: "Cliente Demo 1", confidence: "Alta", days: "0,8 días", amount: "$84.000" },
  { client: "Cliente Demo 3", confidence: "Alta", days: "1,2 días", amount: "$126.000" },
  { client: "Cliente Demo 5", confidence: "Media", days: "2,1 días", amount: "$72.000" },
];

const filters = ["Fecha", "Parking", "Tipo", "Estado WhatsApp", "Ventana atribución"];

function confidenceTone(confidence: string): BadgeTone {
  if (confidence === "Alta") return "success";
  if (confidence === "Media") return "warning";
  return "neutral";
}

function statusTone(status: string): BadgeTone {
  if (status === "Leído" || status === "Respondió") return "success";
  if (status === "Entregado") return "info";
  if (status === "No entregado") return "danger";
  return "neutral";
}

export default async function RecuperacionPage() {
  const [
    { data: importHistory, error: importHistoryError },
    { data: attributionKpis, error: attributionKpisError },
  ] = await Promise.all([getRecoveryImportHistory(), getRecoveryAttributionKpis()]);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-ink">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="border-b border-[#cbd8e3] pb-5">
          <div className="border-l-4 border-clay px-5 py-1 sm:px-6">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-sea">
              Mock visual
            </p>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <h1 className="text-2xl font-medium leading-tight tracking-tight text-navy sm:text-[1.9rem]">
                  Recuperación de carritos
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Seguimiento de WhatsApp, respuestas de clientes y compras posteriores.
                </p>
              </div>
              <ValueBadge tone="warning">
                Vista mock. Datos ficticios. Integraciones pendientes.
              </ValueBadge>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <article
                className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)]"
                key={kpi.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-[#f3f8fb] text-sea">
                    <Icon className="h-4 w-4" />
                  </span>
                  <ValueBadge tone={kpi.tone}>Demo</ValueBadge>
                </div>
                <p className="mt-4 text-sm leading-5 text-slate-600">{kpi.label}</p>
                <p className="mt-2 text-xl font-medium tracking-tight text-navy">{kpi.value}</p>
              </article>
            );
          })}
        </section>

        <PurchasesUploadMock />
        <IncompleteBookingsUploadMock />
        <RecoveryAttributionKpis
          error={attributionKpisError?.message ?? null}
          kpis={attributionKpis}
        />
        <RecoveryImportHistory
          error={importHistoryError?.message ?? null}
          imports={importHistory}
        />

        <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
          <div className="flex flex-col justify-between gap-3 px-5 pt-5 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-base font-medium tracking-tight text-navy">Funnel de recuperación</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Lectura visual del avance desde carrito perdido hasta compra recuperada.
              </p>
            </div>
            <ValueBadge tone="info">24h / 48h / 7 días</ValueBadge>
          </div>
          <div className="grid gap-3 p-5 lg:grid-cols-6">
            {funnel.map((step, index) => (
              <div className="relative rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4" key={step.label}>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{step.label}</p>
                <p className="mt-2 text-2xl font-medium text-navy">{step.value}</p>
                {index < funnel.length - 1 ? (
                  <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-[#9bcbdc] lg:block" />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
          <div className="flex flex-col justify-between gap-3 px-5 pt-5 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-base font-medium tracking-tight text-navy">Casos de recuperación</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Datos ficticios para validar estructura, estados y confianza de atribución.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-[#f8fafb] px-3 py-2 text-xs font-medium text-slate-600"
                  disabled
                  key={filter}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto px-5 pb-5">
            <table className="min-w-[1120px] w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-sm">
              <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Cliente</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Teléfono</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Email</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Tipo</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Fecha carrito</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Estado WhatsApp</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Respuesta</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Intención</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Compró después</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Monto</th>
                  <th className="border-b border-[#d6e1ea] px-3 py-3">Confianza</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr className="bg-white odd:bg-[#fbfdfe]" key={`${item.client}-${item.cartDate}`}>
                    <td className="border-b border-[#edf2f6] px-3 py-3 font-medium text-navy">{item.client}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.phone}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.email}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.type}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.cartDate}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3">
                      <ValueBadge tone={statusTone(item.status)}>{item.status}</ValueBadge>
                    </td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.response}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">{item.intent}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3">
                      <ValueBadge tone={item.boughtAfter === "Sí" ? "success" : "neutral"}>
                        {item.boughtAfter}
                      </ValueBadge>
                    </td>
                    <td className="border-b border-[#edf2f6] px-3 py-3 font-medium text-navy">{item.amount}</td>
                    <td className="border-b border-[#edf2f6] px-3 py-3">
                      <ValueBadge tone={confidenceTone(item.confidence)}>{item.confidence}</ValueBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-[#d6e1ea] bg-white p-5 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
            <h2 className="text-base font-medium tracking-tight text-navy">Motivos detectados</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Categorías mock derivadas de intención o resumen de conversación.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {reasons.map((reason) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-[#dce7ef] bg-[#fbfdfe] px-3 py-2"
                  key={reason.label}
                >
                  <span className="text-sm font-medium text-navy">{reason.label}</span>
                  <ValueBadge tone="neutral">{reason.value}</ValueBadge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#d6e1ea] bg-white p-5 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
            <h2 className="text-base font-medium tracking-tight text-navy">Compras recuperadas</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Casos ficticios atribuidos a contacto posterior por WhatsApp.
            </p>
            <div className="mt-4 grid gap-2">
              {recoveredPurchases.map((purchase) => (
                <div
                  className="rounded-lg border border-[#dce7ef] bg-[#fbfdfe] px-3 py-3"
                  key={purchase.client}
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-navy">{purchase.client}</p>
                      <p className="mt-1 text-xs text-slate-500">Días hasta compra: {purchase.days}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ValueBadge tone={confidenceTone(purchase.confidence)}>{purchase.confidence}</ValueBadge>
                      <span className="text-sm font-medium text-navy">{purchase.amount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-5 rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4 text-sm leading-6 text-[#86510d]">
          Esta vista no consulta fuentes reales. La conexión con n8n, Google Sheets, CSV de compras y reglas
          de atribución queda pendiente para una etapa posterior.
        </div>
      </div>
    </main>
  );
}
