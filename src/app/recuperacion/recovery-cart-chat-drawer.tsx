"use client";

import { Copy, ExternalLink, FileText, MessageCircle, Plus, Send, X } from "lucide-react";
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

type TemplateSendStatus = "idle" | "sending" | "sent" | "error";

type TemplatePreparedSnapshot = {
  cartId: string;
  language: string;
  templateKey: string;
  variables: Record<string, string>;
};

type TemplateSendResponse = {
  code?: string;
  dryRun?: boolean;
  error?: string;
  ok: boolean;
  message?: CartChatMessage;
  send?: {
    businessKey: "MPV" | "EAP";
    messageId?: string | null;
    messageStatus?: string | null;
    status: "sent";
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
  const [templatePreparedSnapshot, setTemplatePreparedSnapshot] = useState<TemplatePreparedSnapshot | null>(null);
  const [templateSendError, setTemplateSendError] = useState<string | null>(null);
  const [templateSendStatus, setTemplateSendStatus] = useState<TemplateSendStatus>("idle");
  const [whatsappWindowOverride, setWhatsappWindowOverride] = useState<WhatsappFreeformWindowPayload | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const shouldScrollToBottomRef = useRef(false);
  const templateSendControllerRef = useRef<AbortController | null>(null);

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
      templateSendControllerRef.current?.abort();
      templateSendControllerRef.current = null;
      setTemplateValidationError(null);
      setTemplateValidationResult(null);
      setTemplatePreparedSnapshot(null);
      setTemplateSendError(null);
      setTemplateSendStatus("idle");
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
        if (isTemplateLibraryOpen) return;
        if (selectedTemplate) {
          if (templateSendStatus !== "sending") {
            templateSendControllerRef.current?.abort();
            templateSendControllerRef.current = null;
            setSelectedTemplate(null);
            setTemplateVariableValues({});
            setTemplateValidationError(null);
            setTemplateValidationResult(null);
            setTemplatePreparedSnapshot(null);
            setTemplateSendError(null);
            setTemplateSendStatus("idle");
          }
          return;
        }
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cartId, isTemplateLibraryOpen, onClose, selectedTemplate, templateSendStatus]);

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
  const canUseTemplates = Boolean(cart?.phone) && freeformWindow.kind !== "unverifiable";
  const selectedTemplatePreparationVariables = selectedTemplate ? selectedTemplate.variables : [];
  const selectedTemplateVariableErrors = selectedTemplatePreparationVariables.filter((variable) => !templateVariableValues[variable.position]?.trim());
  const currentTemplateSnapshot = cartId && selectedTemplate
    ? {
        cartId,
        language: selectedTemplate.language,
        templateKey: selectedTemplate.key,
        variables: selectedTemplateVariablesPayload(),
      }
    : null;
  const isTemplateSending = templateSendStatus === "sending";
  const isPreparedTemplateCurrent = Boolean(
    templateValidationResult?.ok
      && templatePreparedSnapshot
      && currentTemplateSnapshot
      && templateSnapshotsMatch(templatePreparedSnapshot, currentTemplateSnapshot),
  );
  const canConfirmTemplateSend = Boolean(
    isPreparedTemplateCurrent
      && !isTemplateSending
      && templateSendStatus !== "sent"
      && !isTemplateValidating
      && !templateValidationError
      && !error,
  );
  const canValidateTemplate = Boolean(cartId) && Boolean(selectedTemplate) && selectedTemplateVariableErrors.length === 0 && !isTemplateValidating && !isTemplateSending && !error;
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
  const displayedTemplatePreview = isPreparedTemplateCurrent && templateValidationResult?.preview && selectedTemplatePreview
    ? { ...selectedTemplatePreview, ...templateValidationResult.preview }
    : selectedTemplatePreview;
  const isTemplatePrepared = isPreparedTemplateCurrent && templateValidationResult?.ok === true;
  const canRunTemplateAction = isTemplatePrepared ? canConfirmTemplateSend : canValidateTemplate;
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
        appendOutboundMessage(payload.message);
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
  function appendOutboundMessage(message: CartChatMessage) {
    shouldScrollToBottomRef.current = true;
    setData((current) => {
      if (!current) return current;

      const nextMessages = [...(current.messages ?? []), message].sort(
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

  function resetTemplateSendState() {
    setTemplatePreparedSnapshot(null);
    setTemplateSendError(null);
    setTemplateSendStatus("idle");
  }

  function resetTemplatePreparationState() {
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
    resetTemplateSendState();
  }

  function selectedTemplateVariablesPayload() {
    return Object.fromEntries(
      selectedTemplatePreparationVariables.map((variable) => [String(variable.position), templateVariableValues[variable.position]?.trim() ?? ""]),
    );
  }

  function templateSnapshotsMatch(left: TemplatePreparedSnapshot, right: TemplatePreparedSnapshot) {
    return left.cartId === right.cartId
      && left.templateKey === right.templateKey
      && left.language === right.language
      && JSON.stringify(left.variables) === JSON.stringify(right.variables);
  }

  function handleTemplateSelected(template: RecoveryTemplateOption) {
    if (isTemplateSending) return;

    setSelectedTemplate((current) => {
      if (current?.key !== template.key) {
        setTemplateVariableValues({});
      }

      return template;
    });
    resetTemplatePreparationState();
  }

  function closeSelectedTemplate() {
    if (isTemplateSending) return;

    templateSendControllerRef.current?.abort();
    templateSendControllerRef.current = null;
    setSelectedTemplate(null);
    setTemplateVariableValues({});
    resetTemplatePreparationState();
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
    if (isTemplateSending) return;

    setTemplateVariableValues((current) => ({ ...current, [position]: value }));
    resetTemplatePreparationState();
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

  function templateSendErrorMessage(payload: TemplateSendResponse | null) {
    if (payload?.code === "n8n_configuration_error") return "El servicio de envío no está disponible.";
    if (payload?.code === "n8n_timeout") return "El envío tardó más de lo esperado. No vuelvas a enviarlo inmediatamente.";
    if (payload?.code === "n8n_network_error") return "No se pudo contactar el servicio de envío.";
    if (payload?.code === "n8n_http_error" || payload?.code === "n8n_rejected") return "WhatsApp no pudo aceptar el envío.";

    return "No se pudo enviar la plantilla.";
  }
  async function validateSelectedTemplate() {
    if (!cartId || !selectedTemplate || !canValidateTemplate) return;

    setIsTemplateValidating(true);
    setTemplateValidationError(null);
    setTemplateValidationResult(null);
    resetTemplateSendState();

    const variables = selectedTemplateVariablesPayload();

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
        setTemplatePreparedSnapshot(null);
        return;
      }

      setTemplateValidationResult(payload);
      setTemplatePreparedSnapshot({
        cartId,
        language: selectedTemplate.language,
        templateKey: selectedTemplate.key,
        variables,
      });
    } catch {
      setTemplatePreparedSnapshot(null);
      setTemplateValidationError("No se pudo validar la plantilla.");
    } finally {
      setIsTemplateValidating(false);
    }
  }

  async function sendPreparedTemplate() {
    if (!cartId || !selectedTemplate || !canConfirmTemplateSend || isTemplateSending) return;

    const variables = selectedTemplateVariablesPayload();
    const controller = new AbortController();

    templateSendControllerRef.current = controller;
    setTemplateSendError(null);
    setTemplateSendStatus("sending");

    try {
      const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/send-template`, {
        body: JSON.stringify({
          templateKey: selectedTemplate.key,
          language: selectedTemplate.language,
          variables,
          dryRun: false,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const payload = (await response.json()) as TemplateSendResponse;

      if (!response.ok || !payload.ok) {
        setTemplateSendStatus("error");
        setTemplateSendError(templateSendErrorMessage(payload));
        return;
      }

      if (payload.message) {
        appendOutboundMessage(payload.message);
      }

      setTemplateSendStatus("sent");
      setSelectedTemplate(null);
      setTemplateVariableValues({});
      resetTemplatePreparationState();
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }

      setTemplateSendStatus("error");
      setTemplateSendError("No se pudo enviar la plantilla.");
    } finally {
      if (templateSendControllerRef.current === controller) {
        templateSendControllerRef.current = null;
      }
    }
  }

  function openTemplateLibrary() {
    setIsContactActionsOpen(false);
    setIsTemplateLibraryOpen(true);
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
              {canUseTemplates ? (
                <button
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-teal-50"
                  onClick={openTemplateLibrary}
                  type="button"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-teal-700" />
                  Enviar plantilla
                </button>
              ) : null}
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
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 shadow-inner focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100">
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
            {canUseTemplates ? (
              <button
                aria-label="Enviar plantilla"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-white text-teal-700 transition hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                disabled={isTemplateSending || isTemplateLibraryOpen}
                onClick={openTemplateLibrary}
                title="Enviar plantilla"
                type="button"
              >
                <FileText className="h-4 w-4" />
              </button>
            ) : null}
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
          {freeformWindow.kind === "closed" && !canUseTemplates ? (
            <p className="mt-1 rounded-lg border border-[#f2d6a2] bg-[#fff8e8] px-2 py-1 text-[11px] font-medium text-[#92400e] sm:text-xs">
              Han pasado más de 24 horas desde el último mensaje del cliente. Para volver a contactarlo se requiere una plantilla aprobada.
            </p>
          ) : null}
          {freeformWindow.kind === "missing" && !canUseTemplates ? (
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
        {selectedTemplate && displayedTemplatePreview ? (
          <div
            className="absolute inset-0 z-40 flex min-w-0 items-center justify-center overflow-hidden bg-slate-950/35 p-3 sm:p-5"
            onClick={closeSelectedTemplate}
          >
            <section
              aria-labelledby="recovery-template-send-title"
              aria-live="polite"
              aria-modal="true"
              className="grid max-h-[calc(100dvh-1.5rem)] w-full max-w-xl min-w-0 overflow-y-auto rounded-2xl border border-[#d8e7e1] bg-[#f8fbfd] p-4 text-sm text-slate-700 shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:p-5"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="relative min-w-0 pr-10">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Plantilla seleccionada</p>
                <h3 className="mt-1 break-words text-base font-semibold text-navy [overflow-wrap:anywhere]" id="recovery-template-send-title">{selectedTemplate.label}</h3>
                <p className="mt-0.5 break-words font-mono text-[11px] text-slate-500 [overflow-wrap:anywhere]">{selectedTemplate.name}</p>
                <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                  <ValueBadge tone="success">{categoryLabel(selectedTemplate.category)}</ValueBadge>
                  <ValueBadge tone="neutral">{selectedTemplate.language}</ValueBadge>
                </div>
                <button
                  aria-label="Cerrar plantilla"
                  className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d6e1ea] bg-white text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={isTemplateSending}
                  onClick={closeSelectedTemplate}
                  title="Cerrar plantilla"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 min-w-0 rounded-2xl bg-[#eef7f4] p-2">
                <div className="grid min-w-0 gap-2 overflow-hidden rounded-2xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                  {displayedTemplatePreview.header ? <p className="min-w-0 max-w-full break-words font-semibold text-navy [overflow-wrap:anywhere]">{displayedTemplatePreview.header}</p> : null}
                  {displayedTemplatePreview.body ? <p className="min-w-0 max-w-full whitespace-pre-wrap break-words leading-5 [overflow-wrap:anywhere]">{displayedTemplatePreview.body}</p> : null}
                  {displayedTemplatePreview.footer ? <p className="min-w-0 max-w-full break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{displayedTemplatePreview.footer}</p> : null}
                  {displayedTemplatePreview.buttons.length > 0 ? (
                    <div className="grid min-w-0 gap-1 border-t border-slate-100 pt-2">
                      {displayedTemplatePreview.buttons.map((button, index) => (
                        <span key={button.type + "-" + button.text + "-" + index} className="min-w-0 max-w-full break-words rounded-lg bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-teal-700 [overflow-wrap:anywhere]">
                          {button.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedTemplatePreparationVariables.length > 0 ? (
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                  {selectedTemplatePreparationVariables.map((variable) => {
                    const inputId = templateVariableInputId(variable.position);
                    const hasError = !templateVariableValues[variable.position]?.trim();

                    return (
                      <label className="grid min-w-0" htmlFor={inputId} key={variable.position}>
                        <span className="sr-only">Variable {variable.placeholder}</span>
                        <input
                          aria-invalid={hasError}
                          className="h-10 w-full min-w-0 rounded-xl border border-[#d8e7e1] bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                          disabled={isTemplateSending}
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
                <p className="mt-3 rounded-xl border border-[#d8e7e1] bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  Esta plantilla no requiere variables.
                </p>
              )}

              <div className="mt-3 grid gap-2">
                {selectedTemplateVariableErrors.length > 0 ? (
                  <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]" role="alert">
                    {formatMissingTemplateVariablesMessage(selectedTemplateVariableErrors)}
                  </p>
                ) : null}
                {templateSendError ? <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]" role="alert">{templateSendError}</p> : null}
                {templateValidationError ? <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]" role="alert">{templateValidationError}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium text-slate-500">
                    {selectedTemplateVariableErrors.length > 0
                      ? "Completa todas las variables antes de continuar."
                      : isTemplateSending
                        ? "Espera a que termine el envío."
                        : isTemplatePrepared
                          ? "Revisa la vista previa antes de confirmar."
                          : "La preparación valida la plantilla sin enviarla."}
                  </p>
                  <button
                    aria-disabled={!canRunTemplateAction}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                    disabled={!canRunTemplateAction}
                    onClick={() => void (isTemplatePrepared ? sendPreparedTemplate() : validateSelectedTemplate())}
                    type="button"
                  >
                    {isTemplateSending ? "Enviando..." : isTemplateValidating ? "Preparando..." : isTemplatePrepared ? "Confirmar y enviar" : "Preparar envío"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        <RecoveryWhatsappTemplateLibraryModal
          cartId={cartId}
          isOpen={isTemplateLibraryOpen}
          onClose={() => {
            if (!isTemplateSending) setIsTemplateLibraryOpen(false);
          }}
          onSelectTemplate={handleTemplateSelected}
          selectedTemplateKey={selectedTemplate?.key ?? null}
        />
      </div>
    </div>
  );
}