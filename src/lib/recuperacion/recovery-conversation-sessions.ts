import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recoveryWhatsappBusinessPhoneForKey } from "@/lib/recuperacion/whatsapp-freeform-window";

export const RECOVERY_CONVERSATION_SESSION_DEFAULT_PAGE_SIZE = 50;
export const RECOVERY_CONVERSATION_SESSION_MAX_PAGE_SIZE = 100;

export type RecoveryConversationBrand = "MCP" | "EAP";

export type RecoveryConversationSession = {
  brand: RecoveryConversationBrand;
  chatState: string | null;
  durationSeconds: number;
  firstMessageAt: string;
  hasValidPurchaseAfter: boolean;
  hasValidPurchaseBefore: boolean;
  intentCategories: string[];
  lastMessageAt: string;
  messageCount: number;
  nearestPurchaseAfterAt: string | null;
  nearestPurchaseAfterMinutes: number | null;
  potentialCartRelation: boolean;
  primaryIntent: string | null;
  sessionId: string;
  technicalConversationCount: number;
  waIdNormalized: string;
};

export type RecoveryConversationSessionPage = {
  page: number;
  pageSize: number;
  sessions: RecoveryConversationSession[];
  total: number;
};

type RecoveryConversationSessionRpcRow = {
  api_phone_normalized: string;
  brand: RecoveryConversationBrand;
  chat_state: string | null;
  duration_seconds: number | string;
  first_message_at: string;
  has_valid_purchase_after: boolean;
  has_valid_purchase_before: boolean;
  intent_categories: string[] | null;
  last_message_at: string;
  message_count: number | string;
  nearest_purchase_after_at: string | null;
  nearest_purchase_after_minutes: number | string | null;
  potential_cart_relation: boolean;
  primary_intent: string | null;
  session_id: string;
  technical_conversation_count: number | string;
  wa_id_normalized: string;
};

type RecoveryConversationSessionRpcPayload = {
  items: RecoveryConversationSessionRpcRow[];
  total: number | string;
};

function positiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function normalizeRecoveryConversationSessionPagination(page: number, pageSize: number) {
  return {
    page: positiveInteger(page, 1),
    pageSize: Math.min(
      positiveInteger(pageSize, RECOVERY_CONVERSATION_SESSION_DEFAULT_PAGE_SIZE),
      RECOVERY_CONVERSATION_SESSION_MAX_PAGE_SIZE,
    ),
  };
}

function numericValue(value: number | string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getRecoveryConversationSessionPage(
  supabase: SupabaseClient,
  input: { page: number; pageSize: number },
): Promise<RecoveryConversationSessionPage> {
  const pagination = normalizeRecoveryConversationSessionPagination(input.page, input.pageSize);
  const { data, error } = await supabase.rpc("recovery_list_conversation_sessions", {
    p_eap_api_phone: recoveryWhatsappBusinessPhoneForKey("EAP"),
    p_mcp_api_phone: recoveryWhatsappBusinessPhoneForKey("MPV"),
    p_page: pagination.page,
    p_page_size: pagination.pageSize,
  });

  if (error) {
    throw new Error("No se pudieron cargar las sesiones de conversaciones.");
  }

  const payload = data as RecoveryConversationSessionRpcPayload | null;

  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("La respuesta de sesiones de conversaciones no es valida.");
  }

  const rows = payload.items;
  const sessions = rows.map((row) => ({
    brand: row.brand,
    chatState: row.chat_state,
    durationSeconds: numericValue(row.duration_seconds),
    firstMessageAt: row.first_message_at,
    hasValidPurchaseAfter: row.has_valid_purchase_after,
    hasValidPurchaseBefore: row.has_valid_purchase_before,
    intentCategories: row.intent_categories ?? [],
    lastMessageAt: row.last_message_at,
    messageCount: numericValue(row.message_count),
    nearestPurchaseAfterAt: row.nearest_purchase_after_at,
    nearestPurchaseAfterMinutes:
      row.nearest_purchase_after_minutes === null ? null : numericValue(row.nearest_purchase_after_minutes),
    potentialCartRelation: row.potential_cart_relation,
    primaryIntent: row.primary_intent,
    sessionId: row.session_id,
    technicalConversationCount: numericValue(row.technical_conversation_count),
    waIdNormalized: row.wa_id_normalized,
  }));

  return {
    ...pagination,
    sessions,
    total: numericValue(payload.total),
  };
}
