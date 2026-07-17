import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecentRecoveryAttributionCase } from "@/lib/dashboard/data";

type RecoveryAttributionCasesProps = {
  cases: RecentRecoveryAttributionCase[];
  error?: string | null;
};

function formatCurrency(value: number | null) {
  return `$${new Intl.NumberFormat("es-CL").format(Math.round(value ?? 0))}`;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatHours(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `${Number(value).toFixed(1).replace(".", ",")} h`;
}

function confidenceTone(confidence: string | null): BadgeTone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  if (confidence === "low") return "neutral";

  return "neutral";
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

export function RecoveryAttributionCases({ cases, error }: RecoveryAttributionCasesProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Casos recuperados recientes</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Vista interna para auditoria. Muestra contacto normalizado del cliente; no incluye identificadores de reserva ni payloads.
          </p>
        </div>
        <ValueBadge tone="info">Ultimos 20</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudieron cargar los casos recuperados: {error}
          </p>
        </div>
      ) : null}

      {!error && cases.length === 0 ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay casos recuperados todavia.
          </p>
        </div>
      ) : null}

      {!error && cases.length > 0 ? (
        <div className="px-5 py-5">
          <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-xs">
            <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[10%] border-b border-[#d6e1ea] px-2 py-3">Tipo</th>
                <th className="w-[23%] border-b border-[#d6e1ea] px-2 py-3">Contacto</th>
                <th className="w-[8%] border-b border-[#d6e1ea] px-2 py-3">Parking</th>
                <th className="w-[10%] border-b border-[#d6e1ea] px-2 py-3">Mensaje</th>
                <th className="w-[13%] border-b border-[#d6e1ea] px-2 py-3">Fecha carrito</th>
                <th className="w-[13%] border-b border-[#d6e1ea] px-2 py-3">Fecha compra</th>
                <th className="w-[8%] border-b border-[#d6e1ea] px-2 py-3">Horas</th>
                <th className="w-[8%] border-b border-[#d6e1ea] px-2 py-3">Monto</th>
                <th className="w-[9%] border-b border-[#d6e1ea] px-2 py-3">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item, index) => (
                <tr
                  className="bg-white odd:bg-[#fbfdfe]"
                  key={`${item.purchase_created_at ?? "case"}-${index}`}
                >
                  <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                    {item.cart_type ?? "Sin tipo"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div className="break-all font-medium text-navy">
                      {item.email ?? "Sin correo"}
                    </div>
                    <div className="mt-1 break-all text-[11px] text-slate-500">
                      {item.phone ?? "Sin telefono"}
                    </div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {item.parking_code ?? "Sin parking"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={messageSentTone(item.message_sent)}>
                      {messageSentLabel(item.message_sent)}
                    </ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(item.cart_form_datetime)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(item.purchase_created_at)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatHours(item.hours_to_purchase)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 font-medium text-navy">
                    {formatCurrency(item.purchase_amount)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={confidenceTone(item.confidence)}>
                      {item.confidence ?? "Sin confianza"}
                    </ValueBadge>
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
