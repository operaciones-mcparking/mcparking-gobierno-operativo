import "server-only";

export type MetaWhatsappTemplateBusinessKey = "MPV" | "EAP";
export type MetaWhatsappTemplateStatus = "APPROVED" | "PAUSED" | "DISABLED" | "UNKNOWN";

export type SafeWhatsappTemplatePreview = {
  buttons: Array<{
    text: string;
    type: string;
  }>;
  body: string | null;
  footer: string | null;
  header: string | null;
};

export type SafeWhatsappTemplateVariable = {
  placeholder: string;
  position: number;
};

export type SafeMetaWhatsappTemplate = {
  category: string | null;
  key: string;
  label: string;
  language: string;
  name: string;
  preview: SafeWhatsappTemplatePreview;
  status: "APPROVED";
  variables: SafeWhatsappTemplateVariable[];
};

type MetaTemplateResponse = {
  data?: unknown;
};

type MetaTemplateButton = {
  text?: unknown;
  type?: unknown;
};

type MetaTemplateComponent = {
  buttons?: unknown;
  format?: unknown;
  text?: unknown;
  type?: unknown;
};

type MetaTemplateRow = {
  category?: unknown;
  components?: unknown;
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

function normalizeTemplateButtons(value: unknown): SafeWhatsappTemplatePreview["buttons"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((button): SafeWhatsappTemplatePreview["buttons"][number] | null => {
      const source = (button ?? {}) as MetaTemplateButton;
      const text = safeText(source.text);
      const type = safeText(source.type).toUpperCase() || "BUTTON";

      if (!text) return null;

      return { text, type };
    })
    .filter((button): button is SafeWhatsappTemplatePreview["buttons"][number] => button !== null);
}

function normalizeTemplatePreview(components: unknown): SafeWhatsappTemplatePreview {
  const preview: SafeWhatsappTemplatePreview = {
    body: null,
    buttons: [],
    footer: null,
    header: null,
  };

  if (!Array.isArray(components)) return preview;

  for (const item of components) {
    const component = (item ?? {}) as MetaTemplateComponent;
    const type = safeText(component.type).toUpperCase();
    const text = safeText(component.text);

    if (type === "HEADER") {
      preview.header = text || null;
      continue;
    }

    if (type === "BODY") {
      preview.body = text || null;
      continue;
    }

    if (type === "FOOTER") {
      preview.footer = text || null;
      continue;
    }

    if (type === "BUTTONS") {
      preview.buttons = normalizeTemplateButtons(component.buttons);
    }
  }

  return preview;
}

function extractVariables(preview: SafeWhatsappTemplatePreview): SafeWhatsappTemplateVariable[] {
  const text = [preview.header, preview.body, preview.footer, ...preview.buttons.map((button) => button.text)]
    .filter(Boolean)
    .join("\n");
  const positions = new Set<number>();

  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const position = Number.parseInt(match[1] ?? "", 10);

    if (Number.isFinite(position) && position > 0) positions.add(position);
  }

  return [...positions]
    .sort((left, right) => left - right)
    .map((position) => ({ placeholder: `{{${position}}}`, position }));
}

function normalizeTemplate(row: MetaTemplateRow): SafeMetaWhatsappTemplate | null {
  const name = safeText(row.name);
  const language = safeText(row.language);
  const status = normalizeStatus(row.status);

  if (!name || !language || status !== "APPROVED") return null;

  const preview = normalizeTemplatePreview(row.components);

  return {
    category: safeText(row.category).toUpperCase() || null,
    key: `${name}:${language}`,
    label: labelForTemplateName(name),
    language,
    name,
    preview,
    status: "APPROVED",
    variables: extractVariables(preview),
  };
}

function normalizeTemplatesResponse(payload: MetaTemplateResponse): SafeMetaWhatsappTemplate[] {
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .map((row) => normalizeTemplate((row ?? {}) as MetaTemplateRow))
    .filter((template): template is SafeMetaWhatsappTemplate => template !== null)
    .sort((left, right) => left.label.localeCompare(right.label) || left.language.localeCompare(right.language));
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
  url.searchParams.set("fields", "name,language,status,category,components");

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
