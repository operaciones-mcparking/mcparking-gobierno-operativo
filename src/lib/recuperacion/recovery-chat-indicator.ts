import "server-only";

import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";
import { businessKeyForBusinessPhone, businessKeyForParking } from "@/lib/recuperacion/whatsapp-freeform-window";

export type ChatIndicatorSourceCart = {
  cms_url?: string | null;
  form_datetime: string | null;
  id: string;
  parking_code: string | null;
};

export type ChatIndicatorMemoryRow = {
  api_phone_normalized: string | null;
  chat_state: string | null;
  intent_category: string | null;
  message_at: string | null;
  message_bound_type: string | null;
  message_sentiment: string | null;
  wa_id_normalized: string | null;
};

export type ChatConversationIndicator = {
  chatMessageCount: number;
  hasChat: boolean;
  hasInbound: boolean;
  lastInboundChatState: string | null;
  lastInboundIntentCategory: string | null;
  lastInboundMessageAt: string | null;
  lastInboundSentiment: string | null;
};

function validMessageTime(value: string | null | undefined) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

function rowBelongsToCartBusiness(cart: ChatIndicatorSourceCart, row: ChatIndicatorMemoryRow) {
  const cartBusinessKey = businessKeyForParking(
    resolveRecoveryCommercialParking({
      cmsUrl: cart.cms_url ?? null,
      parkingCode: cart.parking_code,
    }).parkingCode,
  );
  const messageBusinessKey = businessKeyForBusinessPhone(row.api_phone_normalized);

  return !cartBusinessKey || !messageBusinessKey || cartBusinessKey === messageBusinessKey;
}

export function chatConversationIndicatorFromMemoryRows(cart: ChatIndicatorSourceCart, rows: ChatIndicatorMemoryRow[]): ChatConversationIndicator {
  const relevantRows = rows.filter((row) => rowBelongsToCartBusiness(cart, row));
  let latestInbound: ChatIndicatorMemoryRow | null = null;
  let latestInboundTime: number | null = null;

  for (const message of relevantRows) {
    if (message.message_bound_type !== "inbound") continue;

    const messageTime = validMessageTime(message.message_at);

    if (latestInbound === null || (messageTime !== null && (latestInboundTime === null || messageTime > latestInboundTime))) {
      latestInbound = message;
      latestInboundTime = messageTime;
    }
  }

  return {
    chatMessageCount: relevantRows.length,
    hasChat: relevantRows.length > 0,
    hasInbound: Boolean(latestInbound),
    lastInboundChatState: latestInbound?.chat_state ?? null,
    lastInboundIntentCategory: latestInbound?.intent_category ?? null,
    lastInboundMessageAt: latestInbound?.message_at ?? null,
    lastInboundSentiment: latestInbound?.message_sentiment ?? null,
  };
}
