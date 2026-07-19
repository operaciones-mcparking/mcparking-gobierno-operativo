"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

type CartChatMessage = {
  chatState: string | null;
  dayOfWeek: string | null;
  direction: "inbound" | "outbound";
  intentCategory: string | null;
  label: string;
  messageAt: string;
  messageBoundType: string | null;
  messageSentiment: string | null;
  messageType: string | null;
  timeOfDay: string | null;
};

type CartChatResponse = {
  cart?: {
    formDatetime: string | null;
    id: string;
    parkingCode: string | null;
    type: string | null;
    windowEnd: string | null;
    windowStart: string | null;
  };
  error?: string;
  messages?: CartChatMessage[];
  ok: boolean;
  reason?: string;
  summary?: {
    hasConversation: boolean;
    inboundMessages: number;
    outboundMessages: number;
    totalMessages: number;
  };
};

type RecoveryCartChatDrawerProps = {
  cartId: string | null;
  onClose: () => void;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function sentimentTone(sentiment: string | null): BadgeTone {
  if (sentiment === "positivo" || sentiment === "muy positivo") return "success";
  if (sentiment === "negativo" || sentiment === "muy negativo") return "danger";
  if (sentiment === "neutral") return "info";

  return "neutral";
}

function directionTone(direction: "inbound" | "outbound"): BadgeTone {
  return direction === "inbound" ? "info" : "success";
}

function genericMessageText(direction: "inbound" | "outbound") {
  return direction === "inbound" ? "Mensaje del cliente" : "Mensaje nuestro / sistema";
}

export function RecoveryCartChatDrawer({ cartId, onClose }: RecoveryCartChatDrawerProps) {
  const [data, setData] = useState<CartChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!cartId) {
      return;
    }

    const activeCartId = cartId;
    const controller = new AbortController();

    async function loadChat() {
      setData(null);
      setError(null);
      setIsLoading(true);

      try {
        const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(activeCartId)}/chat`, {
          method: "GET",
          signal: controller.signal,
        });
        const payload = (await response.json()) as CartChatResponse;

        if (!response.ok || !payload.ok) {
          if (response.status === 401 || response.status === 403) {
            setError("No tienes permisos para ver el chat metadata-only.");
            return;
          }

          setError(payload.error ?? "No se pudo cargar el chat metadata-only.");
          return;
        }

        setData(payload);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }

        setError("No se pudo conectar con el endpoint de chat.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadChat();

    return () => controller.abort();
  }, [cartId]);

  if (!cartId) {
    return null;
  }

  const messages = data?.messages ?? [];
  const summary = data?.summary;

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a]/35">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#d6e1ea] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#edf2f6] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-navy">
              <MessageCircle className="h-4 w-4 text-sea" />
              <h2 className="text-base font-medium tracking-tight">Chat metadata-only</h2>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Burbujas seguras sin Message raw ni text_summary.
            </p>
          </div>
          <button
            aria-label="Cerrar chat"
            className="rounded-lg border border-[#d6e1ea] bg-white p-2 text-slate-600 hover:text-navy"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#edf2f6] bg-[#fbfdfe] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ValueBadge tone="info">{data?.cart?.type ?? "Carrito"}</ValueBadge>
            <ValueBadge tone="neutral">{data?.cart?.parkingCode ?? "Sin parking"}</ValueBadge>
            {summary ? <ValueBadge tone="success">{formatNumber(summary.totalMessages)} mensajes</ValueBadge> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Ventana: {formatDateTime(data?.cart?.windowStart ?? null)} - {formatDateTime(data?.cart?.windowEnd ?? null)}
          </p>
          {summary ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Inbound: {formatNumber(summary.inboundMessages)} · Outbound: {formatNumber(summary.outboundMessages)}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#eef7f1] px-5 py-5">
          {isLoading ? (
            <p className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm text-slate-600">
              Cargando chat metadata-only...
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
              {error}
            </p>
          ) : null}

          {!isLoading && !error && data?.reason ? (
            <p className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm text-slate-600">
              {data.reason}
            </p>
          ) : null}

          {!isLoading && !error && !data?.reason && messages.length === 0 ? (
            <p className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm text-slate-600">
              No hay mensajes asociados en la ventana del carrito.
            </p>
          ) : null}

          {!isLoading && !error && messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const isInbound = message.direction === "inbound";

                return (
                  <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`} key={`${message.messageAt}-${index}`}>
                    <article
                      className={[
                        "max-w-[82%] rounded-2xl border px-4 py-3 text-sm shadow-sm",
                        isInbound
                          ? "rounded-bl-sm border-[#d6e1ea] bg-white text-slate-700"
                          : "rounded-br-sm border-[#bfe5d2] bg-[#dcf8c6] text-slate-800",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <ValueBadge tone={directionTone(message.direction)}>{message.label}</ValueBadge>
                        {message.intentCategory ? (
                          <ValueBadge tone="warning">Intencion: {message.intentCategory}</ValueBadge>
                        ) : null}
                      </div>
                      <p className="font-medium text-navy">{genericMessageText(message.direction)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.messageSentiment ? (
                          <ValueBadge tone={sentimentTone(message.messageSentiment)}>
                            Sentimiento: {message.messageSentiment}
                          </ValueBadge>
                        ) : null}
                        {message.chatState ? <ValueBadge tone="neutral">Estado: {message.chatState}</ValueBadge> : null}
                        {message.messageType ? <ValueBadge tone="neutral">Tipo: {message.messageType}</ValueBadge> : null}
                      </div>
                      <p className="mt-3 text-right text-[11px] text-slate-500">{formatDateTime(message.messageAt)}</p>
                    </article>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#edf2f6] bg-white px-5 py-3">
          <p className="text-xs leading-5 text-slate-500">
            Esta vista no incluye texto de mensajes, telefonos, wa_id, api_phone, payloads ni identificadores tecnicos.
          </p>
        </div>
      </div>
    </div>
  );
}
