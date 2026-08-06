"use client";

import { Copy, ExternalLink, MessageCircle, Plus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { RecoveryWhatsappTemplateLibraryModal, categoryLabel, renderTemplatePreviewText, type RecoveryTemplateOption } from "./recovery-whatsapp-template-library-modal";

const RECOVERY_TIME_ZONE = "America/Santiago";
const WINDOW_TIMER_INTERVAL_MS = 60 * 1000;

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
  source: "live" | "message_memory";
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
  whatsappWindow?: WhatsappFreeformWindowPayload;
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
  code?: string;
  error?: string;
  message?: CartChatMessage;
  ok: boolean;
  stage?: string;
  warning?: string;
  whatsappWindow?: WhatsappFreeformWindowPayload;
};

type TemplateDryRunResponse = {
  code?: string;
  error?: string;
  dryRun?: boolean;
  ok: boolean;
  preview?: {
    body: string | null;
    buttons: Array<{ text: string; type: string }>;
    footer: string | null;
    header: string | null;
  };
  validation?: {
    businessKey: "MPV" | "EAP";
    cartType: string | null;
    language: string;
    maskedPhone: string | null;
    templateName: string;
    variableCount: number;
  };
};

type RecoveryCartChatDrawerProps = {
  cartId: string | null;
  onClose: () => void;
};


type WhatsappFreeformWindowStatus = "open" | "closing_soon" | "closed" | "missing" | "unverifiable";

type WhatsappFreeformWindowPayload = {
  canSendFreeform: boolean;
  businessKey: "MPV" | "EAP" | null;
  closesAt: string | null;
  expiresAt: string | null;
  lastInboundAt: string | null;
  metaRejectedAsClosed: boolean;
  remainingSeconds: number | null;
  source: "live" | "message_memory" | "combined" | null;
  status: WhatsappFreeformWindowStatus;
};

type WhatsappFreeformWindowView = {
  canSendFreeform: boolean;
  kind: "checking" | WhatsappFreeformWindowStatus;
  label: string;
  tone: BadgeTone;
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

function templateValidationBusinessLabel(businessKey: "MPV" | "EAP") {
  return businessKey === "EAP" ? "Estacionamiento Aeropuerto" : "McParking";
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

function formatRemainingTime(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / (60 * 1000)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;

  return `${hours} h ${minutes} min`;
}

function remainingMilliseconds(windowState: WhatsappFreeformWindowPayload, nowMs: number) {
  const closesAt = windowState.closesAt ?? windowState.expiresAt;
  const expiresAtMs = closesAt ? new Date(closesAt).getTime() : Number.NaN;

  if (Number.isFinite(expiresAtMs)) {
    return expiresAtMs - nowMs;
  }

  return typeof windowState.remainingSeconds === "number" ? windowState.remainingSeconds * 1000 : 0;
}

function getTemplateStatusLabel(category: string | null) {
  return category ? `Estado: ${category}` : "Estado: aprobada";
}

function getWhatsappFreeformWindowView(
  windowState: WhatsappFreeformWindowPayload | null | undefined,
  nowMs: number,
  isLoading: boolean,
  hasLoadError: boolean,
): WhatsappFreeformWindowView {
  if (isLoading) {
    return {
      canSendFreeform: false,
      kind: "checking",
      label: "Verificando ventana...",
      tone: "neutral",
    };
  }

  if (hasLoadError || !windowState) {
    return {
      canSendFreeform: false,
      kind: "unverifiable",
      label: "No se pudo verificar ventana",
      tone: "neutral",
    };
  }

  if (windowState.status === "open" || windowState.status === "closing_soon") {
    const remainingMs = remainingMilliseconds(windowState, nowMs);

    if (remainingMs <= 0) {
      return {
        canSendFreeform: false,
        kind: "closed",
        label: "Ventana cerrada · requiere plantilla",
        tone: "danger",
      };
    }

    const remainingLabel = formatRemainingTime(remainingMs);
    const isClosingSoon = windowState.status === "closing_soon";

    return {
      canSendFreeform: true,
      kind: windowState.status,
      label: isClosingSoon ? `Cierra pronto · ${remainingLabel} restantes` : `Ventana abierta · ${remainingLabel} restantes`,
      tone: isClosingSoon ? "warning" : "success",
    };
  }

  if (windowState.status === "closed") {
    return {
      canSendFreeform: false,
      kind: "closed",
      label: "Ventana cerrada · requiere plantilla",
      tone: "danger",
    };
  }

  if (windowState.status === "missing") {
    return {
      canSendFreeform: false,
      kind: "missing",
      label: "Sin respuesta del cliente · requiere plantilla",
      tone: "neutral",
    };
  }

  return {
    canSendFreeform: false,
    kind: "unverifiable",
    label: "No se pudo verificar ventana",
    tone: "neutral",
  };
}
export function RecoveryCartChatDrawer({ cartId, onClose }: RecoveryCartChatDrawerProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [data, setData] = useState<CartChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isContactActionsOpen, setIsContactActionsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSourceFilter, setMessageSourceFilter] = useState<"all" | "live" | "message_memory">("all");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RecoveryTemplateOption | null>(null);
  const [templateVariableValues, setTemplateVariableValues] = useState<Record<number, string>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isTemplateValidating, setIsTemplateValidating] = useState(false);
  const [templateValidationError, setTemplateValidationError] = useState<string | null>(null);
  const [templateValidationResult, setTemplateValidationResult] = useState<TemplateDryRunResponse | null>(null);
  const [whatsappWindowOverride, setWhatsappWindowOverride] = useState<WhatsappFreeformWindowPayload | null>(null);
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

    setNowMs(Date.now());

    const interval = window.setInterval(() => setNowMs(Date.now()), WINDOW_TIMER_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [cartId]);

  useEffect(() => {
    if (!cartId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cartId]);
  useEffect(() => {
    if (!cartId) {
      return;
    }

    const activeCartId = cartId;
    const controller = new AbortController();
    let isActive = true;

    async function loadChat() {
      setData(null);
      setIsContactActionsOpen(false);
      setError(null);
      setSendError(null);
      setSendStatus(null);
      setMessageDraft("");
      setMessageSourceFilter("all");
      setIsTemplateLibraryOpen(false);
      setSelectedTemplate(null);
      setTemplateVariableValues({});
      setIsTemplateValidating(false);
      setTemplateValidationError(null);
      setTemplateValidationResult(null);
      setWhatsappWindowOverride(null);
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
            if (isActive) {
              setError("No tienes permisos para ver el chat metadata-only.");
            }
            return;
          }

          if (isActive) {
            setError(payload.error ?? "No se pudo cargar el chat metadata-only.");
          }
          return;
        }

        if (isActive) {
          shouldScrollToBottomRef.current = true;
          setData(payload);
        }
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }

        if (isActive) {
          setError("No se pudo conectar con el endpoint de chat.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadChat();

    return () => {
      isActive = false;
      controller.abort();
    };
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

    return () => window.cancelAnimationFrame(animationFrame);  }, [data, isLoading, data?.messages?.length]);

  useEffect(() => {
    const currentWindow = whatsappWindowOverride ?? data?.whatsappWindow ?? null;

    if (!currentWindow?.canSendFreeform) return;

    setIsTemplateLibraryOpen(false);
    setSelectedTemplate(null);
    setTemplateVariableValues({});
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
  }, [data?.whatsappWindow, whatsappWindowOverride]);


  if (!cartId) {
    return null;
  }

  const isDataForCurrentCart = data?.cart?.id === cartId;
  const shouldVerifyCurrentCart = !error && (!data || !isDataForCurrentCart);
  const messages = isDataForCurrentCart ? data?.messages ?? [] : [];
  const hasLiveSource = messages.some((message) => message.source === "live");
  const hasMessageMemorySource = messages.some((message) => message.source === "message_memory");
  const shouldShowSourceFilter = hasLiveSource && hasMessageMemorySource;
  const visibleMessages = messageSourceFilter === "all" ? messages : messages.filter((message) => message.source === messageSourceFilter);
  const summary = isDataForCurrentCart ? data?.summary : undefined;
  const isRawChat = summary?.source === "raw";
  const hasLiveMessages = (summary?.liveMessages ?? 0) > 0 || summary?.source === "live";
  const isSensitiveChat = isRawChat || hasLiveMessages;
  const cart = isDataForCurrentCart ? data?.cart : undefined;
  const cmsUrl = safeHttpUrl(cart?.cmsUrl);
  const chatUrl = whatsappUrl(cart?.phone);
  const contactLabel = cart?.email || cart?.phone || "Contacto";
  const serverWhatsappWindow = whatsappWindowOverride ?? (isDataForCurrentCart ? data?.whatsappWindow : null);
  const freeformWindow = getWhatsappFreeformWindowView(serverWhatsappWindow, nowMs, isLoading || shouldVerifyCurrentCart, Boolean(error));
  const isFreeformBlocked = !freeformWindow.canSendFreeform;
  const canSendMessage = !isSending && !isFreeformBlocked && Boolean(cart?.phone) && messageDraft.trim().length > 0;
  const shouldShowTemplateButton = isFreeformBlocked && (freeformWindow.kind === "closed" || freeformWindow.kind === "missing");
  const shouldShowSelectedTemplatePanel = shouldShowTemplateButton && selectedTemplate;
  const selectedTemplatePreparationVariables = selectedTemplate ? selectedTemplate.variables : [];
  const selectedTemplateVariableErrors = selectedTemplatePreparationVariables.filter((variable) => !templateVariableValues[variable.position]?.trim());
  const canValidateTemplate = Boolean(cartId) && Boolean(selectedTemplate) && selectedTemplateVariableErrors.length === 0 && !isTemplateValidating && !error;
  const selectedTemplatePreview = selectedTemplate
    ? {
        body: renderTemplatePreviewText(selectedTemplate.preview.body, templateVariableValues),
        buttons: selectedTemplate.preview.buttons.map((button) => ({
          ...button,
          text: renderTemplatePreviewText(button.text, templateVariableValues) ?? button.text,
        })),
        footer: renderTemplatePreviewText(selectedTemplate.preview.footer, templateVariableValues),
        header: renderTemplatePreviewText(selectedTemplate.preview.header, templateVariableValues),
      }
    : null;
  const messagePlaceholder = (() => {
    if (freeformWindow.kind === "checking") return "Verificando ventana de atención...";
    if (freeformWindow.kind === "closed") return "La ventana de atención está cerrada";
    if (freeformWindow.kind === "missing") return "Se requiere una plantilla aprobada";
    if (freeformWindow.kind === "unverifiable") return "No fue posible verificar la ventana";
    if (!cart?.phone) return "Sin teléfono normalizado";

    return "Escribe un mensaje...";
  })();

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

    if (isFreeformBlocked) {
      const blockedMessage = freeformWindow.kind === "closed"
        ? "La ventana de atención está cerrada. Para volver a contactar se requiere una plantilla aprobada."
        : freeformWindow.kind === "missing"
          ? "No se encontró una ventana iniciada por el cliente. Para contactarlo se requiere una plantilla aprobada."
          : "No fue posible verificar la ventana de atención. Recarga el chat antes de intentar enviar.";

      setSendError(blockedMessage);
      return;
    }

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
        if (payload.whatsappWindow) {
          setWhatsappWindowOverride(payload.whatsappWindow);
        }

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
      setSendError("No se pudo conectar con el endpoint de envío.");
      setSendStatus(null);
    } finally {
      setIsSending(false);
    }
  }
  function handleTemplateSelected(template: RecoveryTemplateOption) {
    setSelectedTemplate((current) => {
      if (current?.key !== template.key) {
        setTemplateVariableValues({});
      }

      return template;
    });
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
  }

  function closeSelectedTemplate() {
    setSelectedTemplate(null);
    setTemplateVariableValues({});
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
  }

  function formatMissingTemplateVariablesMessage(variables: Array<{ position: number }>) {
    const positions = variables.map((variable) => variable.position).sort((left, right) => left - right);

    if (positions.length === 0) return null;

    if (positions.length === 1) return `Falta completar la variable ${positions[0]}.`;

    const lastPosition = positions[positions.length - 1];
    const firstPositions = positions.slice(0, -1).join(", ");

    return `Falta completar las variables ${firstPositions} y ${lastPosition}.`;
  }

  function updateTemplateVariable(position: number, value: string) {
    setTemplateVariableValues((current) => ({ ...current, [position]: value }));
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
  }

  function templateVariableInputId(position: number) {
    return `recovery-template-variable-${position}`;
  }

  function templateValidationErrorMessage(payload: TemplateDryRunResponse | null) {
    if (payload?.code === "missing_variable" || payload?.code === "unknown_variable" || payload?.code === "variable_too_long") {
      return payload.error ?? "Revisa las variables de la plantilla.";
    }

    if (payload?.code === "business_key_unverifiable") {
      return "No se pudo validar el número de WhatsApp de esta conversación.";
    }

    if (payload?.code === "meta_templates_unavailable" || payload?.code === "template_not_allowed" || payload?.code === "template_not_approved") {
      return "No se pudo validar la plantilla seleccionada.";
    }

    return payload?.error ?? "No se pudo validar la plantilla.";
  }

  async function validateSelectedTemplate() {
    if (!cartId || !selectedTemplate || !canValidateTemplate) return;

    setIsTemplateValidating(true);
    setTemplateValidationError(null);
    setTemplateValidationResult(null);

    const variables = Object.fromEntries(
      selectedTemplatePreparationVariables.map((variable) => [String(variable.position), templateVariableValues[variable.position]?.trim() ?? ""]),
    );

    try {
      const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/send-template`, {
        body: JSON.stringify({
          dryRun: true,
          language: selectedTemplate.language,
          templateKey: selectedTemplate.key,
          variables,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as TemplateDryRunResponse;

      if (!response.ok || !payload.ok) {
        setTemplateValidationError(templateValidationErrorMessage(payload));
        return;
      }

      setTemplateValidationResult(payload);
    } catch {
      setTemplateValidationError("No se pudo validar la plantilla.");
    } finally {
      setIsTemplateValidating(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0f172a]/35" onClick={onClose}>
      <div
        className="absolute inset-0 flex h-[100dvh] w-screen max-w-none flex-col bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-2xl sm:border-l sm:border-[#d8e7e1]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex shrink-0 items-center gap-2 border-b border-[#e7f0ec] bg-[#fbfefd] px-3 py-2 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-navy">
              <MessageCircle className="h-4 w-4 shrink-0 text-teal-700" />
              <h2 className="truncate text-sm font-medium tracking-tight sm:text-base">{isSensitiveChat ? "Chat real" : "Chat metadata-only"}</h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-600">{contactLabel}</p>
          </div>
          <button
            aria-expanded={isContactActionsOpen}
            aria-label="Abrir acciones del contacto"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e7e1] bg-white text-slate-700 shadow-sm hover:border-teal-200 hover:bg-teal-50"
            onClick={() => setIsContactActionsOpen((current) => !current)}
            type="button"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="Cerrar chat"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e7e1] bg-white text-slate-600 shadow-sm hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
          {isContactActionsOpen ? (
            <div className="absolute right-3 top-full z-30 mt-2 w-52 rounded-xl border border-[#d8e7e1] bg-white p-2 text-xs font-semibold text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.18)] sm:right-5 sm:w-56">
              {chatUrl ? (
                <a
                  className="flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 hover:bg-teal-50"
                  href={chatUrl}
                  onClick={() => setIsContactActionsOpen(false)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Send className="h-3.5 w-3.5 text-teal-700" />
                  Abrir WhatsApp
                </a>
              ) : null}
              {cart?.email ? (
                <button
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-teal-50"
                  onClick={() => {
                    setIsContactActionsOpen(false);
                    void copyValue(cart.email, "Correo");
                  }}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  Copiar correo
                </button>
              ) : null}
              {cart?.phone ? (
                <button
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-teal-50"
                  onClick={() => {
                    setIsContactActionsOpen(false);
                    void copyValue(cart.phone, "Telefono");
                  }}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  Copiar teléfono
                </button>
              ) : null}
              {cart?.cmsUrl ? (
                <button
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-teal-50"
                  onClick={() => {
                    setIsContactActionsOpen(false);
                    void copyValue(cart.cmsUrl, "Reserva");
                  }}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  Copiar reserva
                </button>
              ) : null}
              {cmsUrl ? (
                <a
                  className="flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 hover:bg-teal-50"
                  href={cmsUrl}
                  onClick={() => setIsContactActionsOpen(false)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  Abrir reserva
                </a>
              ) : null}
              {!chatUrl && !cart?.email && !cart?.phone && !cart?.cmsUrl && !cmsUrl ? <p className="px-3 py-2 text-slate-500">Sin acciones disponibles</p> : null}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-b border-[#e7f0ec] bg-[#f7fbf9] px-3 py-2 sm:px-5">
          {cart ? (
            <div className="grid gap-1.5 text-xs text-slate-700 sm:grid-cols-2 sm:gap-3">
              <div className="min-w-0">
                <span className="font-semibold uppercase tracking-wide text-slate-500">Email</span>
                <p className="break-all font-medium text-slate-900">{cart.email || "-"}</p>
              </div>
              <div className="min-w-0">
                <span className="font-semibold uppercase tracking-wide text-slate-500">Telefono</span>
                <p className="break-all font-medium text-slate-900">{cart.phone || "-"}</p>
              </div>
            </div>
          ) : null}
          <div className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-slate-500 sm:flex">
            <ValueBadge tone="info">{cart?.type ?? "Carrito"}</ValueBadge>
            <ValueBadge tone="neutral">{cart?.parkingCode ?? "Sin parking"}</ValueBadge>
            <ValueBadge tone={freeformWindow.tone}>{freeformWindow.label}</ValueBadge>
            {summary ? <ValueBadge tone="success">{formatNumber(summary.totalMessages)} mensajes</ValueBadge> : null}
            {summary?.liveMessages ? <ValueBadge tone="info">{formatNumber(summary.liveMessages)} live</ValueBadge> : null}
            <span>Historial mostrado: {formatDateTime(cart?.windowStart ?? null)} - {formatDateTime(cart?.windowEnd ?? null)}</span>
            {serverWhatsappWindow?.lastInboundAt ? (
              <span>Último inbound: {formatDateTime(serverWhatsappWindow.lastInboundAt)}</span>
            ) : null}
            {serverWhatsappWindow?.closesAt || serverWhatsappWindow?.expiresAt ? (
              <span>Cierre WhatsApp: {formatDateTime(serverWhatsappWindow.closesAt ?? serverWhatsappWindow.expiresAt)}</span>
            ) : null}
            {summary ? <span>Inbound: {formatNumber(summary.inboundMessages)} - Outbound: {formatNumber(summary.outboundMessages)}</span> : null}
          </div>
          <div className="mt-2 flex sm:hidden">
            <ValueBadge tone={freeformWindow.tone}>{freeformWindow.label}</ValueBadge>
          </div>
          {copyFeedback ? <p className="mt-1 text-xs font-medium text-teal-700">{copyFeedback}</p> : null}
        </div>

        {shouldShowSourceFilter ? (
          <div className="shrink-0 border-b border-[#e7f0ec] bg-[#fbfefd] px-3 py-2 sm:px-5">
            <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
              <button className={`rounded-full px-3 py-1 ${messageSourceFilter === "all" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setMessageSourceFilter("all")} type="button">Todos</button>
              <button className={`rounded-full px-3 py-1 ${messageSourceFilter === "live" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setMessageSourceFilter("live")} type="button">Live</button>
              <button className={`rounded-full px-3 py-1 ${messageSourceFilter === "message_memory" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setMessageSourceFilter("message_memory")} type="button">API</button>
            </div>
          </div>
        ) : null}

        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-3 pb-6 pt-3 sm:px-5 sm:pb-8 sm:pt-5"
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

          {!isLoading && !error && !data?.reason && visibleMessages.length === 0 ? (
            <p className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm text-slate-600">
              No hay mensajes asociados en la ventana del carrito.
            </p>
          ) : null}

          {!isLoading && !error && visibleMessages.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {visibleMessages.map((message, index) => {
                const isInbound = message.direction === "inbound";

                return (
                  <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`} key={`${message.messageAt}-${index}`}>
                    <article
                      className={[
                        "max-w-[88%] rounded-2xl border px-3 py-2.5 text-sm shadow-sm sm:max-w-[82%] sm:px-4 sm:py-3",
                        isInbound
                          ? "rounded-bl-sm border-slate-200 bg-white text-slate-900"
                          : "rounded-br-sm border-[#a9dbc3] bg-[#dff6e8] text-[#14352b]",
                      ].join(" ")}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <ValueBadge tone={directionTone(message.direction)}>{message.label}</ValueBadge>
                        {message.intentCategory ? <span className="text-[11px] font-medium text-amber-700">Intencion: {message.intentCategory}</span> : null}
                      </div>
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-medium leading-5 text-navy">
                        {message.messageText || genericMessageText(message.direction)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] leading-4 text-slate-500">
                        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                          {message.messageSentiment ? <span>Sentimiento: {message.messageSentiment}</span> : null}
                          {message.chatState ? <span>Estado: {message.chatState}</span> : null}
                          {message.messageType ? <span>Tipo: {message.messageType}</span> : null}
                          {message.whatsappStatus ? <span>WhatsApp: {message.whatsappStatus}</span> : null}
                        </div>
                        <span className="ml-auto shrink-0 text-right">{formatDateTime(message.messageAt)}</span>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <form
          className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] sm:px-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSendMessage) void sendMessage();
          }}
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {shouldShowSelectedTemplatePanel && selectedTemplatePreview ? (
            <section
              aria-live="polite"
              className="mb-2 grid min-w-0 gap-3 rounded-2xl border border-[#d8e7e1] bg-[#f8fbfd] p-3 text-sm text-slate-700"
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Plantilla seleccionada</p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-navy">{selectedTemplate.label}</h3>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{selectedTemplate.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <ValueBadge tone="success">{categoryLabel(selectedTemplate.category)}</ValueBadge>
                    <ValueBadge tone="neutral">{selectedTemplate.language}</ValueBadge>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#d6e1ea] bg-white px-3 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    onClick={() => setIsTemplateLibraryOpen(true)}
                    type="button"
                  >
                    Cambiar plantilla
                  </button>
                  <button
                    aria-label="Cerrar plantilla seleccionada"
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-[#f2d6a2] bg-white px-3 text-xs font-semibold text-[#92400e] transition hover:bg-[#fff8e8] focus:outline-none focus:ring-2 focus:ring-amber-300"
                    onClick={closeSelectedTemplate}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cerrar plantilla
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-[#eef7f4] p-2">
                <div className="grid gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                  {selectedTemplatePreview.header ? <p className="font-semibold text-navy">{selectedTemplatePreview.header}</p> : null}
                  {selectedTemplatePreview.body ? <p className="whitespace-pre-wrap break-words leading-5">{selectedTemplatePreview.body}</p> : null}
                  {selectedTemplatePreview.footer ? <p className="text-xs text-slate-500">{selectedTemplatePreview.footer}</p> : null}
                  {selectedTemplatePreview.buttons.length > 0 ? (
                    <div className="grid gap-1 border-t border-slate-100 pt-2">
                      {selectedTemplatePreview.buttons.map((button, index) => (
                        <span key={`${button.type}-${button.text}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-teal-700">
                          {button.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedTemplatePreparationVariables.length > 0 ? (
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  {selectedTemplatePreparationVariables.map((variable) => {
                    const inputId = templateVariableInputId(variable.position);
                    const hasError = !templateVariableValues[variable.position]?.trim();

                    return (
                      <label className="grid min-w-0" htmlFor={inputId} key={variable.position}>
                        <span className="sr-only">Variable {variable.placeholder}</span>
                        <input
                          aria-invalid={hasError}
                          className="h-10 w-full min-w-0 rounded-xl border border-[#d8e7e1] bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                          id={inputId}
                          maxLength={500}
                          onChange={(event) => updateTemplateVariable(variable.position, event.target.value)}
                          placeholder={variable.placeholder}
                          type="text"
                          value={templateVariableValues[variable.position] ?? ""}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-[#d8e7e1] bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  Esta plantilla no requiere variables.
                </p>
              )}

              <div className="grid gap-2">
                {selectedTemplateVariableErrors.length > 0 ? (
                  <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]" role="alert">
                    {formatMissingTemplateVariablesMessage(selectedTemplateVariableErrors)}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium text-slate-500">
                    {selectedTemplateVariableErrors.length > 0
                      ? "Completa todas las variables antes de continuar."
                      : "Variables listas para preparar en modo prueba."}
                  </p>
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-full bg-teal-700 px-4 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                    disabled={!canValidateTemplate}
                    onClick={() => void validateSelectedTemplate()}
                    title="Prepara la plantilla en modo prueba sin enviarla"
                    type="button"
                  >
                    {isTemplateValidating ? "Preparando envío..." : "Preparar envío"}
                  </button>
                </div>
                {isTemplateValidating ? (
                  <p className="rounded-xl border border-[#d8e7e1] bg-white px-3 py-2 text-xs font-semibold text-slate-600" aria-live="polite">
                    Preparando envío...
                  </p>
                ) : null}
                {templateValidationResult?.ok && templateValidationResult.validation ? (
                  <div className="grid gap-3 rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-900" aria-live="polite">
                    <p className="font-semibold">Plantilla preparada</p>
                    {templateValidationResult.preview?.body ? (
                      <div className="rounded-lg bg-white/80 px-3 py-2 text-slate-800">
                        <p className="mb-1 font-semibold text-teal-700">Vista previa final</p>
                        <p className="whitespace-pre-wrap break-words">{templateValidationResult.preview.body}</p>
                      </div>
                    ) : null}
                    <dl className="grid gap-x-3 gap-y-2 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-teal-700">Negocio</dt>
                        <dd>{templateValidationBusinessLabel(templateValidationResult.validation.businessKey)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-teal-700">Plantilla</dt>
                        <dd className="break-words">{selectedTemplate.label}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-teal-700">Idioma</dt>
                        <dd>{templateValidationResult.validation.language}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
                {templateValidationError ? (
                  <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]" role="alert">
                    {templateValidationError}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 shadow-inner focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100">
            {shouldShowTemplateButton ? (
              <button
                aria-label={selectedTemplate ? "Cambiar plantilla aprobada" : "Abrir biblioteca de plantillas aprobadas"}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-teal-700 px-3 text-xs font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                onClick={() => setIsTemplateLibraryOpen(true)}
                type="button"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{selectedTemplate ? "Cambiar plantilla" : "Plantillas"}</span>
              </button>
            ) : null}
            <textarea
              className="max-h-24 min-h-8 flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-500 disabled:text-slate-500"
              disabled={isSending || !cart?.phone || isFreeformBlocked}
              id="recovery-chat-message"
              maxLength={4096}
              onChange={(event) => setMessageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (canSendMessage) void sendMessage();
              }}
              placeholder={messagePlaceholder}
              rows={1}
              value={messageDraft}
            />
            <button
              aria-label="Enviar mensaje"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              disabled={!canSendMessage}
              type="submit"
            >
              {isSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] leading-4 text-slate-500 sm:text-xs">
            <span>Via n8n server-side</span>
            <span>{messageDraft.length}/4096</span>
          </div>
          {freeformWindow.kind === "closed" && !shouldShowTemplateButton ? (
            <p className="mt-1 rounded-lg border border-[#f2d6a2] bg-[#fff8e8] px-2 py-1 text-[11px] font-medium text-[#92400e] sm:text-xs">
              Han pasado más de 24 horas desde el último mensaje del cliente. Para volver a contactarlo se requiere una plantilla aprobada.
            </p>
          ) : null}
          {freeformWindow.kind === "missing" && !shouldShowTemplateButton ? (
            <p className="mt-1 rounded-lg border border-[#d6e1ea] bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 sm:text-xs">
              No hay respuestas válidas del cliente para iniciar la ventana de atención. Para contactar se requiere una plantilla aprobada.
            </p>
          ) : null}
          {freeformWindow.kind === "unverifiable" ? (
            <p className="mt-1 rounded-lg border border-[#d6e1ea] bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 sm:text-xs">
              No fue posible verificar la ventana de atención. Recarga el chat antes de intentar enviar.
            </p>
          ) : null}
          {sendStatus ? <p className="mt-1 rounded-lg border border-teal-100 bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800 sm:text-xs">{sendStatus}</p> : null}
          {sendError ? <p className="mt-1 rounded-lg border border-[#f2d6a2] bg-[#fff8e8] px-2 py-1 text-[11px] font-medium text-[#92400e] sm:text-xs">{sendError}</p> : null}
        </form>
        <RecoveryWhatsappTemplateLibraryModal
          cartId={cartId}
          isOpen={isTemplateLibraryOpen}
          onClose={() => setIsTemplateLibraryOpen(false)}
          onSelectTemplate={handleTemplateSelected}
          selectedTemplateKey={selectedTemplate?.key ?? null}
        />
      </div>
    </div>
  );
}