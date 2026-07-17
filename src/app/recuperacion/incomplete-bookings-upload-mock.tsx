import { AlertTriangle, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

const steps = [
  { label: "Subir CSV", status: "mock", tone: "neutral" as BadgeTone },
  { label: "Validar archivo", status: "mock", tone: "neutral" as BadgeTone },
  { label: "Revisar preview", status: "seguro", tone: "warning" as BadgeTone },
  { label: "Preparar staging", status: "pendiente", tone: "neutral" as BadgeTone },
  { label: "Cruzar con compras", status: "pendiente", tone: "neutral" as BadgeTone },
];

const previewMetrics = [
  { label: "Filas", value: "2.300" },
  { label: "Columnas", value: "13" },
  { label: "Columnas obligatorias faltantes", value: "0" },
  { label: "Emails válidos", value: "2.050 / 2.300" },
  { label: "Teléfonos normalizables", value: "2.100 / 2.300" },
  { label: "Sin email ni teléfono útil", value: "15" },
  { label: "form_datetime parseable", value: "2.290 / 2.300" },
  { label: "Duplicados id", value: "0" },
  { label: "Duplicados booking_id", value: "0" },
  { label: "Duplicados Id_Mensaje", value: "5" },
];

const typeCounts = [
  { label: "abandoned", value: "1.700", tone: "info" as BadgeTone },
  { label: "canceled", value: "600", tone: "warning" as BadgeTone },
  { label: "unknown", value: "0", tone: "neutral" as BadgeTone },
];

const messageSentCounts = [
  { label: "true", value: "1.800", tone: "success" as BadgeTone },
  { label: "false", value: "400", tone: "neutral" as BadgeTone },
  { label: "unknown", value: "100", tone: "warning" as BadgeTone },
];

export function IncompleteBookingsUploadMock() {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga de carritos perdidos</h2>
            <ValueBadge tone="warning">Mock visual — aún no guarda datos</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube un CSV de BackendIncompleteBookings2 para validar reservas incompletas, abandonos y
            cancelaciones antes de cruzarlas con WhatsApp y compras posteriores.
          </p>
        </div>
        <ValueBadge tone="info">Fuente n8n</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#d9c7aa] bg-[#fffaf4] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#e8d7bd] bg-white text-[#9a621a]">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo de carritos</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado: <span className="font-medium text-navy">BackendIncompleteBookings2.csv</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Fuente n8n: BackendIncompleteBookings2.</p>
            <p className="mt-4 rounded-lg border border-[#e8d7bd] bg-white px-3 py-3 text-sm text-slate-500">
              Sin archivo seleccionado. Esta sección todavía es solo visual.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy opacity-55"
                disabled
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Seleccionar CSV
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white opacity-45"
                disabled
                type="button"
              >
                <AlertTriangle className="h-4 w-4" />
                Validar CSV
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c5dce7] bg-white text-sea">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-sm leading-6 text-slate-600">
                No se muestran emails, teléfonos, cms_url, bform ni filas reales en la vista previa. Solo
                agregados seguros.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <h3 className="text-sm font-medium text-navy">Flujo propuesto</h3>
            <div className="mt-3 grid gap-2">
              {steps.map((step, index) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-2"
                  key={step.label}
                >
                  <span className="text-sm text-slate-700">
                    {index + 1}. {step.label}
                  </span>
                  <ValueBadge tone={step.tone}>{step.status}</ValueBadge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h3 className="text-sm font-medium text-navy">Preview seguro simulado</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Datos ficticios para validar estructura visual. No corresponde a una carga real.
                </p>
              </div>
              <ValueBadge tone="warning">Mock</ValueBadge>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {previewMetrics.map((metric) => (
                <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3" key={metric.label}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-base font-medium text-navy">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Tipos</h3>
              <div className="mt-3 grid gap-2">
                {typeCounts.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3"
                    key={item.label}
                  >
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <ValueBadge tone={item.tone}>{item.value}</ValueBadge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Message_Sent</h3>
              <div className="mt-3 grid gap-2">
                {messageSentCounts.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3"
                    key={item.label}
                  >
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <ValueBadge tone={item.tone}>{item.value}</ValueBadge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-medium text-[#86510d]">Preparar importación</h3>
                <p className="mt-1 text-xs leading-5 text-[#86510d]">
                  Disponible cuando exista endpoint, staging y reglas de deduplicación.
                </p>
              </div>
              <button
                className="rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] opacity-55"
                disabled
                type="button"
              >
                Preparar importación
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
