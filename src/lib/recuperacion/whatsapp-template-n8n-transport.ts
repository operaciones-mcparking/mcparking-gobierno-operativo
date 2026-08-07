import "server-only";

import type { RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import type { RecoveryWhatsappTemplateN8nPayload } from "@/lib/recuperacion/whatsapp-template-n8n-payload";

const RECOVERY_TEMPLATE_N8N_TIMEOUT_MS = 15000;

export type RecoveryWhatsappTemplateN8nSendSuccess = {
  message: string | null;
  messageId: string;
  messageStatus: string | null;
  ok: true;
  senderKey: RecoveryWhatsappBusinessKey;
  status: "sent";
};

export type RecoveryWhatsappTemplateN8nSendFailureCode =
  | "n8n_configuration_error"
  | "n8n_network_error"
  | "n8n_timeout"
  | "n8n_http_error"
  | "n8n_invalid_json"
  | "n8n_rejected"
  | "n8n_invalid_mode"
  | "n8n_sender_mismatch"
  | "n8n_missing_message_id"
  | "n8n_invalid_response";

export type RecoveryWhatsappTemplateN8nSendFailureStage =
  | "configuration"
  | "network"
  | "timeout"
  | "http"
  | "invalid_json"
  | "response_contract";

export type RecoveryWhatsappTemplateN8nSendFailure = {
  code: RecoveryWhatsappTemplateN8nSendFailureCode;
  message: string;
  ok: false;
  stage: RecoveryWhatsappTemplateN8nSendFailureStage;
  status: number;
};

export type RecoveryWhatsappTemplateN8nSendResult =
  | RecoveryWhatsappTemplateN8nSendSuccess
  | RecoveryWhatsappTemplateN8nSendFailure;

type RecoveryTemplateN8nResponse = {
  message?: unknown;
  messageId?: unknown;
  messageStatus?: unknown;
  mode?: unknown;
  ok?: unknown;
  senderKey?: unknown;
  whatsappStatus?: unknown;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function logSafeFailure(params: {
  code: RecoveryWhatsappTemplateN8nSendFailureCode;
  n8nStatus?: number;
  stage: RecoveryWhatsappTemplateN8nSendFailureStage;
  status: number;
}) {
  console.error("Recovery template n8n transport failed", {
    code: params.code,
    n8nStatus: params.n8nStatus,
    stage: params.stage,
    status: params.status,
  });
}

function safeFailure(
  code: RecoveryWhatsappTemplateN8nSendFailureCode,
  message: string,
  status: number,
  stage: RecoveryWhatsappTemplateN8nSendFailureStage,
  n8nStatus?: number,
): RecoveryWhatsappTemplateN8nSendFailure {
  logSafeFailure({ code, n8nStatus, stage, status });

  return {
    code,
    message,
    ok: false,
    stage,
    status,
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function validateN8nTemplateResponse(value: unknown, expectedSenderKey: RecoveryWhatsappBusinessKey): RecoveryWhatsappTemplateN8nSendResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return safeFailure("n8n_invalid_response", "n8n devolvio una respuesta invalida.", 502, "response_contract");
  }

  const payload = value as RecoveryTemplateN8nResponse;
  const mode = safeString(payload.mode);
  const senderKey = safeString(payload.senderKey);
  const messageId = safeString(payload.messageId);

  if (payload.ok !== true) {
    return safeFailure("n8n_rejected", "n8n no confirmo el envio de la plantilla.", 502, "response_contract");
  }

  if (mode !== "template") {
    return safeFailure("n8n_invalid_mode", "n8n devolvio un modo inesperado.", 502, "response_contract");
  }

  if (senderKey !== expectedSenderKey) {
    return safeFailure("n8n_sender_mismatch", "n8n devolvio un negocio inesperado.", 502, "response_contract");
  }

  if (!messageId) {
    return safeFailure("n8n_missing_message_id", "n8n no devolvio identificador de mensaje.", 502, "response_contract");
  }

  return {
    message: safeString(payload.message) || null,
    messageId,
    messageStatus: safeString(payload.messageStatus) || null,
    ok: true,
    senderKey: expectedSenderKey,
    status: "sent",
  };
}

export async function sendRecoveryWhatsappTemplateViaN8n(
  payload: RecoveryWhatsappTemplateN8nPayload,
): Promise<RecoveryWhatsappTemplateN8nSendResult> {
  const webhookUrl = process.env.N8N_RECOVERY_WHATSAPP_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_RECOVERY_WEBHOOK_SECRET;

  if (!webhookUrl) {
    return safeFailure("n8n_configuration_error", "Falta configurar N8N_RECOVERY_WHATSAPP_WEBHOOK_URL.", 500, "configuration");
  }

  if (!webhookSecret) {
    return safeFailure("n8n_configuration_error", "Falta configurar N8N_RECOVERY_WEBHOOK_SECRET.", 500, "configuration");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECOVERY_TEMPLATE_N8N_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(webhookUrl, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "x-mcparking-recovery-secret": webhookSecret,
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    return safeFailure(
      isAbortError(error) ? "n8n_timeout" : "n8n_network_error",
      isAbortError(error) ? "n8n no respondio a tiempo." : "No se pudo conectar con n8n.",
      502,
      isAbortError(error) ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timeout);
  }

  let responsePayload: unknown;

  try {
    responsePayload = await response.json();
  } catch {
    return safeFailure("n8n_invalid_json", "n8n devolvio una respuesta no JSON.", 502, "invalid_json", response.status);
  }

  if (!response.ok) {
    return safeFailure("n8n_http_error", `n8n respondio HTTP ${response.status}.`, 502, "http", response.status);
  }

  return validateN8nTemplateResponse(responsePayload, payload.senderKey);
}