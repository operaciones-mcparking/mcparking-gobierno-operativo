import { AlertTriangle, CircleDollarSign, Clock3, PackageCheck } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecoveryCartStatusSummary as RecoveryCartStatusSummaryData } from "@/lib/dashboard/data";

type RecoveryCartStatusSummaryProps = {
  error?: string | null;
  summary: RecoveryCartStatusSummaryData | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

const statusCards: Array<{
  description: string;
  icon: typeof Clock3;
  key: keyof Omit<RecoveryCartStatusSummaryData, "total">;
  label: string;
  tone: BadgeTone;
}> = [
  {
    description: "No recuperados que aun no vencen por fecha de salida.",
    icon: Clock3,
    key: "not_recovered",
    label: "Vivos pendientes",
    tone: "info",
  },
  {
    description: "No recuperados cuya salida prevista ya paso.",
    icon: AlertTriangle,
    key: "expired",
    label: "Expirados",
    tone: "warning",
  },
  {
    description: "Compraron posteriormente con monto mayor a cero.",
    icon: CircleDollarSign,
    key: "recovered_with_amount",
    label: "Recuperados con monto",
    tone: "success",
  },
  {
    description: "Compraron posteriormente con monto cero o pack de dias.",
    icon: PackageCheck,
    key: "recovered_pack",
    label: "Recuperados pack / $0",
    tone: "neutral",
  },
];

export function RecoveryCartStatusSummary({ error, summary }: RecoveryCartStatusSummaryProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Estado de carritos</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Resumen operativo de carritos vivos, expirados y recuperados.
          </p>
        </div>
        <ValueBadge tone="info">{summary ? `${formatNumber(summary.total)} carritos` : "Sin datos"}</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar el resumen de estados: {error}
          </p>
        </div>
      ) : null}

      {!error && !summary ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay carritos disponibles para resumir.
          </p>
        </div>
      ) : null}

      {!error && summary ? (
        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {statusCards.map((card) => {
              const Icon = card.icon;

              return (
                <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4" key={card.key}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ValueBadge tone={card.tone}>Estado</ValueBadge>
                  </div>
                  <p className="mt-4 text-sm leading-5 text-slate-600">{card.label}</p>
                  <p className="mt-2 text-2xl font-medium tracking-tight text-navy">
                    {formatNumber(summary[card.key])}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{card.description}</p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-2 text-sm leading-5 text-slate-600">
            Los carritos expirados ya pasaron su fecha de salida prevista.
          </p>
        </div>
      ) : null}
    </section>
  );
}
