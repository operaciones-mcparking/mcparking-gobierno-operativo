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
  headerMedia: {
    format: "DOCUMENT" | "IMAGE" | "VIDEO";
    link: string | null;
  } | null;
  previewMedia: {
    format: "DOCUMENT" | "IMAGE" | "VIDEO";
    link: string | null;
    source: "meta_example";
  } | null;
};

export type SafeWhatsappTemplateParameterComponent = "BODY" | "BUTTON" | "HEADER";
export type SafeWhatsappTemplateParameterType = "document" | "image" | "text" | "video";

export type SafeWhatsappTemplateParameter = {
  component: SafeWhatsappTemplateParameterComponent;
  id: string;
  label: string;
  name: string | null;
  needsInput: boolean;
  placeholder: string;
  position: number | null;
  predefinedValue: string | null;
  required: boolean;
  supported: boolean;
  type: SafeWhatsappTemplateParameterType;
};

export type SafeWhatsappTemplateCompatibility = {
  reasons: string[];
  status: "blocked" | "supported";
};

export type SafeWhatsappTemplateSendMedia = {
  format: "DOCUMENT" | "IMAGE" | "VIDEO";
  id: string | null;
  link: string | null;
  source: "https_url" | "meta_media_id";
};

export type SafeWhatsappTemplateVariable = {
  component: "BODY" | "HEADER";
  id: string;
  name: string | null;
  placeholder: string;
  position: number;
};

export type SafeMetaWhatsappTemplate = {
  category: string | null;
  compatibility: SafeWhatsappTemplateCompatibility;
  key: string;
  label: string;
  language: string;
  name: string;
  parameterFormat: "NAMED" | "POSITIONAL" | "UNKNOWN";
  parameters: SafeWhatsappTemplateParameter[];
  preview: SafeWhatsappTemplatePreview;
  sendMedia: SafeWhatsappTemplateSendMedia | null;
  status: "APPROVED";
  variables: SafeWhatsappTemplateVariable[];
};

type MetaTemplateResponse = {
  data?: unknown;
  paging?: {
    next?: unknown;
  };
};

type MetaTemplateButton = {
  text?: unknown;
  type?: unknown;
};

type MetaTemplateComponent = {
  buttons?: unknown;
  example?: unknown;
  format?: unknown;
  text?: unknown;
  type?: unknown;
};

type MetaTemplateRow = {
  category?: unknown;
  components?: unknown;
  language?: unknown;
  name?: unknown;
  parameter_format?: unknown;
  status?: unknown;
};

const META_GRAPH_API_VERSION = "v25.0";
const META_WHATSAPP_TEMPLATES_TTL_MS = 10 * 60 * 1000;
const MEDIA_FORMATS = new Set(["DOCUMENT", "IMAGE", "VIDEO"]);

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

function normalizeMediaFormat(value: unknown): SafeWhatsappTemplateSendMedia["format"] | null {
  const format = safeText(value).toUpperCase();

  return MEDIA_FORMATS.has(format) ? format as SafeWhatsappTemplateSendMedia["format"] : null;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeParameterFormat(value: unknown): SafeMetaWhatsappTemplate["parameterFormat"] {
  const format = safeText(value).toUpperCase();

  if (format === "NAMED" || format === "POSITIONAL") return format;

  return "UNKNOWN";
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
    headerMedia: null,
    previewMedia: null,
  };

  if (!Array.isArray(components)) return preview;

  for (const item of components) {
    const component = (item ?? {}) as MetaTemplateComponent;
    const type = safeText(component.type).toUpperCase();
    const text = safeText(component.text);

    if (type === "HEADER") {
      const format = safeText(component.format).toUpperCase();

      if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
        const example = component.example && typeof component.example === "object" ? component.example as { header_handle?: unknown } : null;
        const handles = Array.isArray(example?.header_handle) ? example.header_handle : [];
        const link = safeText(handles[0]);

        preview.headerMedia = { format, link: link || null };
        preview.previewMedia = { format, link: link || null, source: "meta_example" };
      } else {
        preview.header = text || null;
      }
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

function extractTextPlaceholders(text: string | null) {
  if (!text) return [];

  return [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/g)]
    .map((match, index) => {
      const raw = safeText(match[1]);
      const numericPosition = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;

      return {
        index,
        name: Number.isFinite(numericPosition) ? null : raw,
        placeholder: `{{${raw}}}`,
        position: Number.isFinite(numericPosition) && numericPosition > 0 ? numericPosition : null,
      };
    })
    .filter((placeholder) => placeholder.position !== null || placeholder.name !== null);
}

function uniqueTextParameters(
  component: "BODY" | "HEADER",
  text: string | null,
  parameterFormat: SafeMetaWhatsappTemplate["parameterFormat"],
): SafeWhatsappTemplateParameter[] {
  const seen = new Set<string>();
  const parameters: SafeWhatsappTemplateParameter[] = [];

  for (const placeholder of extractTextPlaceholders(text)) {
    const parameterKey = placeholder.name ?? String(placeholder.position);

    if (seen.has(parameterKey)) continue;

    seen.add(parameterKey);
    parameters.push({
      component,
      id: `${component}:${parameterKey}`,
      label: `${component === "HEADER" ? "Encabezado" : "Cuerpo"} ${placeholder.placeholder}`,
      name: placeholder.name,
      needsInput: true,
      placeholder: placeholder.placeholder,
      position: placeholder.position ?? placeholder.index + 1,
      predefinedValue: null,
      required: true,
      supported: component === "BODY" || component === "HEADER",
      type: "text",
    });
  }

  return parameters.sort((left, right) => {
    if (parameterFormat === "NAMED") return left.id.localeCompare(right.id);

    return (left.position ?? 0) - (right.position ?? 0) || left.id.localeCompare(right.id);
  });
}

function configuredSendMediaKey(
  businessKey: MetaWhatsappTemplateBusinessKey,
  name: string,
  language: string,
) {
  return `${businessKey}:${name}:${language}`;
}

function configuredSendMediaEnvValue() {
  return envValue("RECOVERY_WHATSAPP_TEMPLATE_SEND_MEDIA_JSON");
}

function normalizeConfiguredSendMediaEntry(
  value: unknown,
  expectedFormat: SafeWhatsappTemplateSendMedia["format"],
): SafeWhatsappTemplateSendMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entry = value as { format?: unknown; id?: unknown; link?: unknown; source?: unknown; type?: unknown };
  const format = normalizeMediaFormat(entry.format ?? entry.type);
  const id = safeText(entry.id);
  const link = safeText(entry.link);
  const source = safeText(entry.source).toLowerCase();

  if (format !== expectedFormat) return null;

  if (id && (!source || source === "meta_media_id" || source === "id")) {
    return { format, id, link: null, source: "meta_media_id" };
  }

  if (link && isHttpsUrl(link) && (!source || source === "https_url" || source === "link")) {
    return { format, id: null, link, source: "https_url" };
  }

  return null;
}

function configuredSendMediaForTemplate({
  businessKey,
  format,
  language,
  name,
}: {
  businessKey: MetaWhatsappTemplateBusinessKey;
  format: SafeWhatsappTemplateSendMedia["format"] | null;
  language: string;
  name: string;
}): SafeWhatsappTemplateSendMedia | null {
  if (!format) return null;

  const raw = configuredSendMediaEnvValue();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const mediaByKey = parsed as Record<string, unknown>;
    const businessScoped = mediaByKey[businessKey];
    const businessMap = businessScoped && typeof businessScoped === "object" && !Array.isArray(businessScoped)
      ? businessScoped as Record<string, unknown>
      : {};
    const entry = mediaByKey[configuredSendMediaKey(businessKey, name, language)]
      ?? mediaByKey[`${name}:${language}`]
      ?? businessMap[`${name}:${language}`]
      ?? businessMap[name];

    return normalizeConfiguredSendMediaEntry(entry, format);
  } catch {
    return null;
  }
}

function headerMediaFormatFromComponents(components: unknown): SafeWhatsappTemplateSendMedia["format"] | null {
  if (!Array.isArray(components)) return null;

  for (const item of components) {
    const component = (item ?? {}) as MetaTemplateComponent;
    const type = safeText(component.type).toUpperCase();
    if (type !== "HEADER") continue;

    return normalizeMediaFormat(component.format);
  }

  return null;
}

function normalizeTemplateParameters(
  components: unknown,
  preview: SafeWhatsappTemplatePreview,
  sendMedia: SafeWhatsappTemplateSendMedia | null,
  parameterFormat: SafeMetaWhatsappTemplate["parameterFormat"],
) {
  const parameters: SafeWhatsappTemplateParameter[] = [];
  const reasons: string[] = [];

  if (!Array.isArray(components)) {
    return { compatibility: { reasons, status: "supported" as const }, parameters };
  }

  for (const item of components) {
    const component = (item ?? {}) as MetaTemplateComponent;
    const type = safeText(component.type).toUpperCase();
    const format = safeText(component.format).toUpperCase();

    if (type === "HEADER") {
      if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
        const mediaType = format.toLowerCase() as "document" | "image" | "video";

        parameters.push({
          component: "HEADER",
          id: "HEADER:media",
          label: `Encabezado ${format.toLowerCase()}`,
          name: null,
          needsInput: false,
          placeholder: format,
          position: null,
          predefinedValue: sendMedia?.id ?? sendMedia?.link ?? null,
          required: true,
          supported: Boolean(sendMedia),
          type: mediaType,
        });

        if (!sendMedia) {
          reasons.push(`Este template requiere ${mediaType === "image" ? "una imagen" : mediaType === "video" ? "un video" : "un documento"} para enviarse.`);
        }
        continue;
      }

      if (format && format !== "TEXT") {
        reasons.push(`HEADER ${format} no soportado.`);
        continue;
      }

      parameters.push(...uniqueTextParameters("HEADER", safeText(component.text) || null, parameterFormat));
      continue;
    }

    if (type === "BODY") {
      parameters.push(...uniqueTextParameters("BODY", safeText(component.text) || null, parameterFormat));
      continue;
    }

    if (type === "FOOTER") {
      if (extractTextPlaceholders(safeText(component.text) || null).length > 0) {
        reasons.push("FOOTER con variables no soportado.");
      }
      continue;
    }

    if (type === "BUTTONS") {
      for (const button of normalizeTemplateButtons(component.buttons)) {
        if (button.type === "COPY_CODE") {
          reasons.push("Botón COPY_CODE requiere soporte específico antes de enviar.");
          continue;
        }

        if (extractTextPlaceholders(button.text).length > 0) {
          reasons.push(`Botón ${button.type} con variables no soportado.`);
        }
      }
      continue;
    }

    reasons.push(`Componente ${type || "desconocido"} no soportado.`);
  }

  return {
    compatibility: {
      reasons: [...new Set(reasons)],
      status: reasons.length > 0 ? "blocked" as const : "supported" as const,
    },
    parameters,
  };
}

function normalizeTemplate(row: MetaTemplateRow, businessKey: MetaWhatsappTemplateBusinessKey): SafeMetaWhatsappTemplate | null {
  const name = safeText(row.name);
  const language = safeText(row.language);
  const status = normalizeStatus(row.status);

  if (!name || !language || status !== "APPROVED") return null;

  const preview = normalizeTemplatePreview(row.components);
  const parameterFormat = normalizeParameterFormat(row.parameter_format);
  const sendMedia = configuredSendMediaForTemplate({
    businessKey,
    format: headerMediaFormatFromComponents(row.components),
    language,
    name,
  });
  const { compatibility, parameters } = normalizeTemplateParameters(row.components, preview, sendMedia, parameterFormat);
  const variables = parameters
    .filter((parameter): parameter is SafeWhatsappTemplateParameter & { component: "BODY" | "HEADER"; position: number } => (
      parameter.type === "text"
        && parameter.needsInput
        && parameter.supported
        && (parameter.component === "BODY" || parameter.component === "HEADER")
        && parameter.position !== null
    ))
    .map((parameter) => ({
      component: parameter.component,
      id: parameter.id,
      name: parameter.name,
      placeholder: parameter.placeholder,
      position: parameter.position,
    }));

  return {
    category: safeText(row.category).toUpperCase() || null,
    compatibility,
    key: `${name}:${language}`,
    label: labelForTemplateName(name),
    language,
    name,
    parameterFormat,
    parameters,
    preview,
    sendMedia,
    status: "APPROVED",
    variables,
  };
}

function normalizeTemplatesResponse(payload: MetaTemplateResponse, businessKey: MetaWhatsappTemplateBusinessKey): SafeMetaWhatsappTemplate[] {
  if (!Array.isArray(payload.data)) return [];

  return payload.data
    .map((row) => normalizeTemplate((row ?? {}) as MetaTemplateRow, businessKey))
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

  const rows: unknown[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phoneNumberId}/message_templates`;

  while (nextUrl) {
    const url = new URL(nextUrl);

    if (!url.searchParams.has("fields")) {
      url.searchParams.set("fields", "name,language,status,category,parameter_format,components");
    }

    if (!url.searchParams.has("limit")) {
      url.searchParams.set("limit", "100");
    }

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

    if (Array.isArray(payload.data)) {
      rows.push(...payload.data);
    }

    const next = safeText(payload.paging?.next);
    nextUrl = next || null;
  }

  const templates = normalizeTemplatesResponse({ data: rows }, businessKey);

  templateCache.set(businessKey, {
    expiresAt: now + META_WHATSAPP_TEMPLATES_TTL_MS,
    templates,
  });

  return templates;
}
