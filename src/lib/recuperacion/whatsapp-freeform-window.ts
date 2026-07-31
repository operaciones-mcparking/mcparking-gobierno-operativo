import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsappFreeformWindowStatus = "open" | "expiring" | "closed" | "no_inbound" | "unverifiable";

export type WhatsappFreeformWindowState = {
  canSendFreeform: boolean;
  expiresAt: string | null;
  lastInboundAt: string | null;
  remainingSeconds: number | null;
  status: WhatsappFreeformWindowStatus;
};

const WHATSAPP_FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;
const WHATSAPP_WINDOW_WARNING_SECONDS = 2 * 60 * 60;

type CartContactRow = {
  phone_normalized: string | null;
};

type MessageAtRow = {
  message_at: string | null;
};

function emptyState(status: "no_inbound" | "unverifiable"): WhatsappFreeformWindowState {
  return {
    canSendFreeform: false,
    expiresAt: null,
    lastInboundAt: null,
    remainingSeconds: null,
    status,
  };
}

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

export function classifyWhatsappFreeformWindow(lastInboundAt: string | null, nowMs = Date.now()): WhatsappFreeformWindowState {
  const lastInboundMs = validTimestamp(lastInboundAt);

  if (lastInboundMs === null) {
    return emptyState("no_inbound");
  }

  const expiresAtMs = lastInboundMs + WHATSAPP_FREEFORM_WINDOW_MS;
  const remainingMs = expiresAtMs - nowMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (nowMs >= expiresAtMs) {
    return {
      canSendFreeform: false,
      expiresAt: new Date(expiresAtMs).toISOString(),
      lastInboundAt: new Date(lastInboundMs).toISOString(),
      remainingSeconds: 0,
      status: "closed",
    };
  }

  return {
    canSendFreeform: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
    lastInboundAt: new Date(lastInboundMs).toISOString(),
    remainingSeconds,
    status: remainingSeconds <= WHATSAPP_WINDOW_WARNING_SECONDS ? "expiring" : "open",
  };
}

async function latestInboundFromQuery(query: PromiseLike<{ data: MessageAtRow[] | null; error: unknown }>) {
  const { data, error } = await query;

  if (error) {
    return { error: true as const, timestamp: null };
  }

  const timestamp = validTimestamp(data?.[0]?.message_at ?? null);

  return { error: false as const, timestamp };
}

async function latestLiveInbound(supabase: SupabaseClient, field: "cart_id" | "phone_normalized", value: string) {
  return latestInboundFromQuery(
    supabase
      .from("recovery_whatsapp_live_messages")
      .select("message_at")
      .eq(field, value)
      .eq("direction", "inbound")
      .order("message_at", { ascending: false })
      .limit(1),
  );
}

async function latestMemoryInbound(supabase: SupabaseClient, tableName: "recovery_whatsapp_message_memory_raw_import" | "recovery_whatsapp_message_memory_import", phoneNormalized: string) {
  return latestInboundFromQuery(
    supabase
      .from(tableName)
      .select("message_at")
      .eq("wa_id_normalized", phoneNormalized)
      .eq("message_bound_type", "inbound")
      .order("message_at", { ascending: false })
      .limit(1),
  );
}

export async function getWhatsappFreeformWindowForCart(supabase: SupabaseClient, cartId: string, nowMs = Date.now()): Promise<WhatsappFreeformWindowState> {
  const { data: cartData, error: cartError } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("phone_normalized")
    .eq("id", cartId)
    .maybeSingle();

  if (cartError) {
    return emptyState("unverifiable");
  }

  const cart = cartData as CartContactRow | null;

  if (!cart?.phone_normalized) {
    return emptyState("no_inbound");
  }

  const results = await Promise.all([
    latestLiveInbound(supabase, "cart_id", cartId),
    latestLiveInbound(supabase, "phone_normalized", cart.phone_normalized),
    latestMemoryInbound(supabase, "recovery_whatsapp_message_memory_raw_import", cart.phone_normalized),
    latestMemoryInbound(supabase, "recovery_whatsapp_message_memory_import", cart.phone_normalized),
  ]);

  if (results.some((result) => result.error)) {
    return emptyState("unverifiable");
  }

  const latestInboundMs = Math.max(...results.map((result) => result.timestamp ?? Number.NEGATIVE_INFINITY));

  if (!Number.isFinite(latestInboundMs)) {
    return emptyState("no_inbound");
  }

  return classifyWhatsappFreeformWindow(new Date(latestInboundMs).toISOString(), nowMs);
}
