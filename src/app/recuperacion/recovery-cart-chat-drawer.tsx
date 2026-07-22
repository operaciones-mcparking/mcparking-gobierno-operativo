"use client";

import { Copy, ExternalLink, MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

const RECOVERY_TIME_ZONE = "America/Santiago";

type CartChatMessage = {
  chatState: string | null;
  dayOfWeek: string | null;
  direction: "inbound" | "outbound";
  intentCategory: string | null;
  label: string;
  messageAt: string;
  messageBoundType: string | null;
  messageSentiment: string | null;
  messageSource: string | null;
  messageText: string | null;
  messageType: string | null;
  timeOfDay: string | null;
  whatsappStatus: string | null;
};

type CartChatResponse = {
  cart?: {
    cmsUrl: string | null;
    email: string | null;
    formDatetime: string | null;
    id: string;
    parkingCode: string | null;
    phone: string | null;
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
    liveMessages?: number;
    outboundMessages: number;
    source: "metadata" | "raw" | "live";
    totalMessages: number;
  };
};

type SendChatResponse = {
  error?: string;
  message?: CartChatMessage;
  ok: boolean;
  stage?: string;
  warning?: string;
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
    timeZone: RECOVERY_TIME_ZONE,
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

function whatsappUrl(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");

  return digits ? `https://wa.me/${digits}` : null;
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function RecoveryCartChatDrawer({ cartId, onClose }: RecoveryCartChatDrawerProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [data, setData] = useState<CartChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const shouldScrollToBottomRef = useRef(false);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => setCopyFeedback(null), 2200);

    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  useEffect(() => {
    if (!cartId) {
      return;
    }

    const activeCartId = cartId;
    const controller = new AbortController();

    async function loadChat() {
      setData(null);
      setError(null);
      setSendError(null);
      setSendStatus(null);
      setMessageDraft("");
      previousMessageCountRef.current = 0;
      shouldScrollToBottomRef.current = true;
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

        shouldScrollToBottomRef.current = true;
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

  useEffect(() => {
    if (!cartId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cartId, onClose]);

  useEffect(() => {
    if (isLoading || !data) {
      return;
    }

    const messageCount = data.messages?.length ?? 0;
    const isInitialLoad = previousMessageCountRef.current === 0;
    const hasNewMessages = messageCount > previousMessageCountRef.current;
    const shouldScroll = shouldScrollToBottomRef.current || isInitialLoad || hasNewMessages;

    previousMessageCountRef.current = messageCount;

    if (!shouldScroll) {
      return;
    }

    shouldScrollToBottomRef.current = false;

    const scrollToBottom = () => {
      const container = messagesScrollRef.current;

      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    };

    const animationFrame = window.requestAnimationFrame(() => {
      scrollToBottom();
      window.setTimeout(scrollToBottom, 50);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [data, isLoading, data?.messages?.length]);

  if (!cartId) {
    return null;
  }

  const messages = data?.messages ?? [];
  const summary = data?.summary;
  const isRawChat = summary?.source === "raw";
  const hasLiveMessages = (summary?.liveMessages ?? 0) > 0 || summary?.source === "live";
  const isSensitiveChat = isRawChat || hasLiveMessages;
  const cart = data?.cart;
  const cmsUrl = safeHttpUrl(cart?.cmsUrl);
  const chatUrl = whatsappUrl(cart?.phone);

  async function copyValue(value: string | null | undefined, label: string) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(`${label} copiado`);
    } catch {
      setCopyFeedback(`No se pudo copiar ${label.toLowerCase()}`);
    }
  }

  async function sendMessage() {
    if (!cartId || isSending) return;

    const messageText = messageDraft.trim();

    if (!messageText) {
      setSendError("Escribe un mensaje antes de enviar.");
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendStatus("Enviando mensaje por n8n...");

    try {
      const response = await fetch("/api/recuperacion/carritos/" + encodeURIComponent(cartId) + "/chat/send", {
        body: JSON.stringify({ messageText }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as SendChatResponse;

      if (payload.message) {
        shouldScrollToBottomRef.current = true;
        setData((current) => {
          if (!current) return current;

          const nextMessages = [...(current.messages ?? []), payload.message as CartChatMessage].sort(
            (left, right) => new Date(left.messageAt).getTime() - new Date(right.messageAt).getTime(),
          );
          const nextSummary = current.summary
            ? {
                ...current.summary,
                hasConversation: true,
                liveMessages: (current.summary.liveMessages ?? 0) + 1,
                outboundMessages: current.summary.outboundMessages + 1,
                source: current.summary.source === "metadata" ? "live" : current.summary.source,
                totalMessages: current.summary.totalMessages + 1,
              }
            : {
                hasConversation: true,
                inboundMessages: 0,
                liveMessages: 1,
                outboundMessages: 1,
                source: "live" as const,
                totalMessages: 1,
              };

          return { ...current, messages: nextMessages, summary: nextSummary };
        });
      }

      if (!response.ok || !payload.ok) {
        setSendError(payload.error ?? "No se pudo enviar el mensaje.");
        setSendStatus(null);
        return;
      }

      setMessageDraft("");
      setSendStatus("Mensaje enviado");

      if (payload.warning) {
        setSendError(payload.warning);
      }
    } catch {
      setSendError("No se pudo conectar con el endpoint de envio.");
      setSendStatus(null);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a]/35" onClick={onClose}>
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#d8e7e1] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e7f0ec] bg-[#fbfefd] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-navy">
              <MessageCircle className="h-4 w-4 text-teal-700" />
              <h2 className="text-base font-medium tracking-tight">
                {isSensitiveChat ? "Chat real" : "Chat metadata-only"}
              </h2>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {isRawChat
                ? "Vista admin sensible con texto real de mensajes."
                : "Burbujas seguras sin Message raw ni text_summary."}
            </p>
          </div>
          <button
            aria-label="Cerrar chat"
            className="rounded-lg border border-[#d8e7e1] bg-white p-2 text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#e7f0ec] bg-[#f7fbf9] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ValueBadge tone="info">{data?.cart?.type ?? "Carrito"}</ValueBadge>
            <ValueBadge tone="neutral">{data?.cart?.parkingCode ?? "Sin parking"}</ValueBadge>
            {summary ? <ValueBadge tone="success">{formatNumber(summary.totalMessages)} mensajes</ValueBadge> : null}
            {summary?.liveMessages ? <ValueBadge tone="info">{formatNumber(summary.liveMessages)} live</ValueBadge> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Ventana: {formatDateTime(data?.cart?.windowStart ?? null)} - {formatDateTime(data?.cart?.windowEnd ?? null)}
          </p>
          {summary ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Inbound: {formatNumber(summary.inboundMessages)} · Outbound: {formatNumber(summary.outboundMessages)}
            </p>
          ) : null}

          {cart ? (
            <div className="mt-3 rounded-2xl border border-[#d8e7e1] bg-white/95 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto</p>
              <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="text-xs text-slate-500">Email</span>
                  <p className="break-all font-medium text-slate-900">{cart.email || "-"}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-xs text-slate-500">Telefono</span>
                  <p className="break-all font-medium text-slate-900">{cart.phone || "-"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {chatUrl ? (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#a9dbc3] bg-[#e5f6ee] px-3 py-1.5 text-xs font-semibold text-[#0f766e] hover:bg-[#d8f0e4]"
                    href={chatUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Send className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                ) : null}
                {cart.phone ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e7e1] bg-[#f8fbfa] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50"
                    onClick={() => void copyValue(cart.phone, "Telefono")}
                    type="button"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar telefono
                  </button>
                ) : null}
                {cart.cmsUrl ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e7e1] bg-[#f8fbfa] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50"
                    onClick={() => void copyValue(cart.cmsUrl, "Reserva")}
                    type="button"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar reserva
                  </button>
                ) : null}
                {cmsUrl ? (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e7e1] bg-[#f8fbfa] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50"
                    href={cmsUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir reserva
                  </a>
                ) : null}
              </div>
              {copyFeedback ? <p className="mt-2 text-xs font-medium text-teal-700">{copyFeedback}</p> : null}
            </div>
          ) : null}
        </div>

        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-5 pb-8 pt-5"
          style={{
            backgroundColor: "#edf8f3",
            backgroundImage:
              "radial-gradient(circle at 16px 16px, rgba(15, 118, 110, 0.07) 0 1px, transparent 1.5px), radial-gradient(circle at 42px 38px, rgba(20, 83, 45, 0.045) 0 1px, transparent 1.5px)",
            backgroundSize: "56px 56px",
          }}
        >
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="rounded-2xl border border-[#d8e7e1] bg-white/90 px-6 py-5 text-center shadow-sm backdrop-blur">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#d8e7e1] border-t-teal-700" />
                <p className="text-sm font-semibold text-slate-900">Cargando chat real...</p>
                <p className="mt-1 text-xs text-slate-500">Buscando mensajes asociados al carrito</p>
              </div>
            </div>
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
                          ? "rounded-bl-sm border-slate-200 bg-white text-slate-900"
                          : "rounded-br-sm border-[#a9dbc3] bg-[#dff6e8] text-[#14352b]",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <ValueBadge tone={directionTone(message.direction)}>{message.label}</ValueBadge>
                        {message.intentCategory ? (
                          <ValueBadge tone="warning">Intencion: {message.intentCategory}</ValueBadge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap break-words font-medium text-navy">
                        {message.messageText || genericMessageText(message.direction)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.messageSentiment ? (
                          <ValueBadge tone={sentimentTone(message.messageSentiment)}>
                            Sentimiento: {message.messageSentiment}
                          </ValueBadge>
                        ) : null}
                        {message.chatState ? <ValueBadge tone="neutral">Estado: {message.chatState}</ValueBadge> : null}
                        {message.messageType ? <ValueBadge tone="neutral">Tipo: {message.messageType}</ValueBadge> : null}
                        {message.whatsappStatus ? <ValueBadge tone="neutral">Estado WhatsApp: {message.whatsappStatus}</ValueBadge> : null}
                      </div>
                      <p className="mt-3 text-right text-[11px] text-slate-500">{formatDateTime(message.messageAt)}</p>
                    </article>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-4 shadow-[0_-10px_28px_rgba(15,23,42,0.10)]">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="recovery-chat-message">
            Responder por WhatsApp
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              className="min-h-[88px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-500"
              disabled={isSending || !cart?.phone}
              id="recovery-chat-message"
              maxLength={4096}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder={cart?.phone ? "Escribe una respuesta para el cliente..." : "Este carrito no tiene telefono normalizado."}
              value={messageDraft}
            />
            <button
              className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              disabled={isSending || !cart?.phone || messageDraft.trim().length === 0}
              onClick={() => void sendMessage()}
              type="button"
            >
              {isSending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSending ? "Enviando..." : "Enviar"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Envio server-side via n8n. No se expone token en el navegador.</span>
            <span>{messageDraft.length}/4096</span>
          </div>
          {sendStatus ? (
            <p className="mt-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800">
              {sendStatus}
            </p>
          ) : null}
          {sendError ? (
            <p className="mt-2 rounded-lg border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-medium text-[#92400e]">
              {sendError}
            </p>
          ) : null}
        </div>

        <div className="border-t border-[#e7f0ec] bg-[#fbfefd] px-5 py-3">
          <p className="text-xs leading-5 text-slate-500">
            {isSensitiveChat
              ? "Vista admin sensible. El contacto solo se muestra aqui; no incluye wa_id, api_phone, payloads ni identificadores tecnicos."
              : "Esta vista no incluye texto de mensajes. El contacto solo se muestra aqui; no incluye wa_id, api_phone, payloads ni identificadores tecnicos."}
          </p>
        </div>
      </div>
    </div>
  );
}
