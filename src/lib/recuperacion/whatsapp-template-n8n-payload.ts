import "server-only";

import {
  buildRecoveryWhatsappMetaTemplatePayloadPreview,
  type MetaTemplateMessagePayload,
} from "@/lib/recuperacion/whatsapp-template-send-payload";
import type { RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";

export type RecoveryWhatsappTemplateN8nPayload = {
  cartId: string;
  cartType: string | null;
  metaPayload: MetaTemplateMessagePayload;
  mode: "template";
  operatorEmail: string;
  previewText: string;
  senderKey: RecoveryWhatsappBusinessKey;
  sentAt: string;
  source: "recovery_web";
};

export type RecoveryWhatsappTemplateN8nPayloadPreview = {
  metaPayload: MetaTemplateMessagePayload;
  mode: "template";
  previewText: string;
  senderKey: RecoveryWhatsappBusinessKey;
  source: "recovery_web";
};

export type BuildRecoveryWhatsappTemplateN8nPayloadInput = {
  cartId: string;
  cartType: string | null;
  metaPayload: MetaTemplateMessagePayload;
  operatorEmail: string;
  previewText: string;
  senderKey: RecoveryWhatsappBusinessKey;
  sentAt: string;
};

export function buildRecoveryWhatsappTemplateN8nPayload({
  cartId,
  cartType,
  metaPayload,
  operatorEmail,
  previewText,
  senderKey,
  sentAt,
}: BuildRecoveryWhatsappTemplateN8nPayloadInput): RecoveryWhatsappTemplateN8nPayload {
  return {
    cartId,
    cartType,
    metaPayload,
    mode: "template",
    operatorEmail,
    previewText,
    senderKey,
    sentAt,
    source: "recovery_web",
  };
}

export function buildRecoveryWhatsappTemplateN8nPayloadPreview(
  payload: RecoveryWhatsappTemplateN8nPayload,
  maskedTo: string | null,
): RecoveryWhatsappTemplateN8nPayloadPreview {
  return {
    metaPayload: buildRecoveryWhatsappMetaTemplatePayloadPreview(payload.metaPayload, maskedTo),
    mode: payload.mode,
    previewText: payload.previewText,
    senderKey: payload.senderKey,
    source: payload.source,
  };
}