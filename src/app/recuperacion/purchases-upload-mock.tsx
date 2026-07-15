import { CheckCircle2, Database, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

const previewMetrics = [
  { label: "Filas", value: "2.302" },
  { label: "Columnas", value: "58" },
  { label: "Columnas obligatorias faltantes", value: "0" },
  { label: "Compras validas", value: "1.897" },
  { label: "Monto valido", value: "$37.369.445" },
  { label: "Emails validos", value: "2.302 / 2.302" },
  { label: "Telefonos normalizables", value: "2.296 / 2.302" },
  { label: "Duplicados por Id", value: "0" },
  { label: "Duplicados por Buchungsnummer", value: "0" },
];

const bookingStatusCounts = [
  { label: "BookingStatus 1", value: "646", tone: "success" as BadgeTone },
  { label: "BookingStatus 2", value: "405", tone: "neutral" as BadgeTone },
  { label: "BookingStatus 8", value: "1.251", tone: "success" as BadgeTone },
];

const steps = [
  { label: "Subir CSV", status: "mock", tone: "info" as BadgeTone },
  { label: "Validar archivo", status: "mock", tone: "info" as BadgeTone },
  { label: "Revisar preview", status: "mock", tone: "warning" as BadgeTone },
  { label: "Confirmar importacion", status: "pendiente", tone: "neutral" as BadgeTone },
  { label: "Guardar en staging", status: "pendiente", tone: "neutral" as BadgeTone },
];

export function PurchasesUploadMock() {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga de compras</h2>
            <ValueBadge tone="warning">Mock visual - aun no guarda datos</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube un CSV de compras para validar columnas, compras validas y montos antes de importarlo al
            modulo de recuperacion.
          </p>
        </div>
        <ValueBadge tone="info">Solo CSV por ahora</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#9bcbdc] bg-[#f7fbfd] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#c5dce7] bg-white text-sea">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo de compras</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado: <span className="font-medium text-navy">mcp_Buchungen.csv</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Por ahora solo CSV. Excel se evaluara despues.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-slate-500"
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
                <CheckCircle2 className="h-4 w-4" />
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
                No se muestran emails, telefonos, patentes ni filas reales en la vista previa. Solo agregados
                seguros.
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
                  Basado en la muestra auditada. No corresponde a una importacion real.
                </p>
              </div>
              <ValueBadge tone="warning">Pendiente backend</ValueBadge>
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

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">BookingStatus</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {bookingStatusCounts.map((status) => (
                  <div className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={status.label}>
                    <p className="text-xs text-slate-500">{status.label}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-medium text-navy">{status.value}</span>
                      <ValueBadge tone={status.tone}>{status.tone === "success" ? "valida" : "no valida"}</ValueBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4 md:w-56">
              <div className="flex items-center gap-2 text-[#86510d]">
                <Database className="h-4 w-4" />
                <h3 className="text-sm font-medium">Importacion</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#86510d]">
                Confirmar importacion y guardar en staging aun no estan implementados.
              </p>
              <button
                className="mt-3 w-full rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] opacity-55"
                disabled
                type="button"
              >
                Confirmar importación
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
