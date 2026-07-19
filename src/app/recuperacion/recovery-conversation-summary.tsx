import { MessageCircleReply, MessagesSquare } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecoveryConversationSummary as RecoveryConversationSummaryData } from "@/lib/dashboard/data";

type RecoveryConversationSummaryProps = {
  error?: string | null;
  summary: RecoveryConversationSummaryData | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

const metricCards: Array<{
  description: (summary: RecoveryConversationSummaryData) => string;
  key: keyof Pick<
    RecoveryConversationSummaryData,
    | "associated_messages"
    | "cotizar_reserva_carts"
    | "descuentos_carts"
    | "not_recovered_carts"
    | "problemas_carts"
    | "ubicacion_transporte_carts"
    | "with_inbound_response"
    | "without_conversation"
  >;
  label: string;
  tone: BadgeTone;
}> = [
  {
    description: () => "Carritos vivos pendientes sin compra atribuida.",
    key: "not_recovered_carts",
    label: "No recuperados",
    tone: "info",
  },
  {
    description: () => "Tienen al menos un mensaje inbound dentro de la ventana.",
    key: "with_inbound_response",
    label: "Con respuesta",
    tone: "success",
  },
  {
    description: () => "Sin mensajes asociados dentro de 7 dias.",
    key: "without_conversation",
    label: "Sin conversacion",
    tone: "neutral",
  },
  {
    description: (summary) =>
      `${formatNumber(summary.inbound_messages)} inbound + ${formatNumber(summary.outbound_messages)} outbound.`,
    key: "associated_messages",
    label: "Mensajes asociados",
    tone: "warning",
  },
  {
    description: () => "Carritos con inbound de ubicacion o transporte.",
    key: "ubicacion_transporte_carts",
    label: "Ubicacion / transporte",
    tone: "info",
  },
  {
    description: () => "Carritos con inbound de cotizacion de reserva.",
    key: "cotizar_reserva_carts",
    label: "Cotizar reserva",
    tone: "warning",
  },
  {
    description: (summary) =>
      `${formatNumber(summary.problema_tecnico_carts)} tecnico + ${formatNumber(
        summary.problema_operativo_carts,
      )} operativo.`,
    key: "problemas_carts",
    label: "Problemas",
    tone: "danger",
  },
  {
    description: () => "Carritos con inbound de descuentos.",
    key: "descuentos_carts",
    label: "Descuentos",
    tone: "neutral",
  },
];

function toneForIntent(intent: string): BadgeTone {
  if (intent === "ubicacion_transporte") return "info";
  if (intent === "cotizar_reserva" || intent === "reserva") return "warning";
  if (intent === "problema_tecnico" || intent === "problema_operativo") return "danger";
  if (intent === "descuentos") return "success";

  return "neutral";
}

export function RecoveryConversationSummary({ error, summary }: RecoveryConversationSummaryProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2 text-navy">
            <MessagesSquare className="h-4 w-4 text-sea" />
            <h2 className="text-base font-medium tracking-tight">Conversaciones asociadas</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Cruce por telefono y ventana de 7 dias desde el carrito. No incluye mensajes crudos.
          </p>
        </div>
        <ValueBadge tone="info">Solo No recuperados</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar el resumen de conversaciones: {error}
          </p>
        </div>
      ) : null}

      {!error && !summary ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay conversaciones asociadas disponibles todavia.
          </p>
        </div>
      ) : null}

      {!error && summary ? (
        <div className="grid gap-5 p-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4" key={card.key}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea">
                    <MessageCircleReply className="h-4 w-4" />
                  </span>
                  <ValueBadge tone={card.tone}>7 dias</ValueBadge>
                </div>
                <p className="mt-4 text-sm leading-5 text-slate-600">{card.label}</p>
                <p className="mt-2 text-2xl font-medium tracking-tight text-navy">
                  {formatNumber(Number(summary[card.key] ?? 0))}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{card.description(summary)}</p>
              </article>
            ))}
          </div>

          <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <h3 className="text-sm font-medium text-navy">Principales intenciones inbound</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Conteo por carritos distintos y mensajes asociados.
            </p>
            <div className="mt-4 grid gap-2">
              {summary.top_inbound_intents.length > 0 ? (
                summary.top_inbound_intents.map((item) => (
                  <div
                    className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3"
                    key={item.intent_category}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-navy">{item.intent_category}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatNumber(item.message_count)} mensajes inbound
                        </p>
                      </div>
                      <ValueBadge tone={toneForIntent(item.intent_category)}>
                        {formatNumber(item.cart_count)} carritos
                      </ValueBadge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3 text-sm text-slate-600">
                  No hay intenciones inbound para mostrar.
                </p>
              )}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
