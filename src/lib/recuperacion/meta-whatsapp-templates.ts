import "server-only";

export type MetaWhatsappTemplateBusinessKey = "MPV" | "EAP";
export type MetaWhatsappTemplateStatus = "APPROVED" | "PAUSED" | "DISABLED" | "UNKNOWN";

export type SafeMetaWhatsappTemplate = {
  category: string | null;
  label: string;
  language: string;
  name: string;
  status: MetaWhatsappTemplateStatus;
};

type MetaTemplateResponse = {
  data?: unknown;
};

type MetaTemplateRow = {
  category?: unknown;
  language?: unknown;
  name?: unknown;
  status?: unknown;
};

const META_GRAPH_API_VERSION = "v25.0";
const META_WHATSAPP_TEMPLATES_TTL_MS = 10 * 60 * 1000;

const templateCache = new Map<MetaWhatsappTemplateBusinessKey, { expiresAt: number; templates: SafeMetaWhatsappTemplate[] }>();

function envValue(name: string) {
  return typeof process.env[name] === "string" ? process.env[name]?.trim() ?? "" : "";
}

function accessToken() {
  return envValue("META_WHATSAPP_ACCESS_TOKEN");
}

function phoneNumberIdForBusiness(businessKey: MetaWhatsappTemplateBusinessKey) {
  return businessKey === "MPV"
    ? envValue("META_WHATSAPP_PHONE_NUMBER_ID_MPV")
    : envValue("META_WHATSAPP_PHONE_NUMBER_ID_EAP");
}

function normalizeStatus(value: unknown): MetaWhatsappTemplateStatus {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (status === "APPROVED" || status === "PAUSED" || status === "DISABLED") return status;

  return "UNKNOWN";
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function labelForTemplateName(name: string) {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeTemplate(row: MetaTemplateRow): SafeMetaWhatsappTemplate | null {
  const name = safeText(row.name);
  const language = safeText(row.language);
  const status = normalizeStatus(row.status);

  if (!name || !language || status !== "APPROVED") return null;

  return {
    category: safeText(row.category) || null,
    label: labelForTemplateName(name),
    language,
    name,
    status,
  };
}

function normalizeTemplatesResponse(payload: MetaTemplateResponse): SafeMetaWhatsappTemplate[] {
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .map((row) => normalizeTemplate((row ?? {}) as MetaTemplateRow))
    .filter((template): template is SafeMetaWhatsappTemplate => template !== null)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function clearMetaWhatsappTemplatesCache() {
  templateCache.clear();
}

export async function fetchMetaWhatsappTemplatesForBusiness(
  businessKey: MetaWhatsappTemplateBusinessKey,
): Promise<SafeMetaWhatsappTemplate[]> {
  const cached = templateCache.get(businessKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) return cached.templates;

  const token = accessToken();
  const phoneNumberId = phoneNumberIdForBusiness(businessKey);

  if (!token || !phoneNumberId) {
    throw new Error("Meta WhatsApp templates are not configured.");
  }

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phoneNumberId}/message_templates`);
  url.searchParams.set("fields", "name,language,status,category");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar templates de WhatsApp.");
  }

  let payload: MetaTemplateResponse;

  try {
    payload = (await response.json()) as MetaTemplateResponse;
  } catch {
    throw new Error("No se pudieron interpretar los templates de WhatsApp.");
  }

  const templates = normalizeTemplatesResponse(payload);

  templateCache.set(businessKey, {
    expiresAt: now + META_WHATSAPP_TEMPLATES_TTL_MS,
    templates,
  });

  return templates;
}