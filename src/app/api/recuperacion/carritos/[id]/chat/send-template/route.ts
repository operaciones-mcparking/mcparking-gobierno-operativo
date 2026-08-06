import { NextResponse, type NextRequest } from "next/server";

import { fetchMetaWhatsappTemplatesForBusiness, type SafeMetaWhatsappTemplate } from "@/lib/recuperacion/meta-whatsapp-templates";
import { getWhatsappFreeformWindowForCart, type RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CartTemplateSendDryRunRow = {
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
  type: string | null;
};

type SendTemplateDryRunRequest = {
  dryRun?: unknown;
  language?: unknown;
  templateKey?: unknown;
  variables?: unknown;
};

type TemplateVariableValue = {
  position: number;
  text: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VARIABLE_KEY_RE = /^(?:\{\{\s*)?(\d+)(?:\s*\}\})?$/;
const MAX_TEMPLATE_VARIABLE_LENGTH = 500;

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
}

function hasOnlyAllowedPayloadKeys(value: SendTemplateDryRunRequest) {
  const allowedKeys = new Set(["dryRun", "language", "templateKey", "variables"]);

  return Object.keys(value as Record<string, unknown>).every((key) => allowedKeys.has(key));
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401, "auth_required"), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError("No se pudo validar el acceso.", 500, "auth_check_failed"), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403, "forbidden"), ok: false as const };
  }

  return { ok: true as const, supabase, user };
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupportedBusinessKey(value: unknown): value is RecoveryWhatsappBusinessKey {
  return value === "MPV" || value === "EAP";
}

function maskPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 6) return null;

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

async function loadCart(supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, cartId: string) {
  const { data, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,phone_normalized,type,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo cargar el carrito solicitado.", 500, "cart_load_failed"), ok: false as const };
  if (!data) return { error: jsonError("Carrito no encontrado.", 404, "cart_not_found"), ok: false as const };

  return { cart: data as CartTemplateSendDryRunRow, ok: true as const };
}

function templateHasUnsupportedVariables(template: SafeMetaWhatsappTemplate) {
  const unsupportedText = [
    template.preview.header,
    template.preview.footer,
    ...template.preview.buttons.map((button) => button.text),
  ]
    .filter(Boolean)
    .join("\n");

  return /\{\{\s*\d+\s*\}\}/.test(unsupportedText);
}

function findTemplate(templates: SafeMetaWhatsappTemplate[], templateKey: string, language: string) {
  return templates.find((template) => (template.key === templateKey || template.name === templateKey) && template.language === language) ?? null;
}

function normalizeVariables(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: jsonError("Debes enviar variables como objeto.", 400, "invalid_variables"), ok: false as const };
  }

  const normalized = new Map<number, string>();

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const match = rawKey.match(VARIABLE_KEY_RE);

    if (!match) {
      return { error: jsonError("La solicitud contiene variables desconocidas.", 400, "unknown_variable"), ok: false as const };
    }

    const position = Number.parseInt(match[1] ?? "", 10);

    if (!Number.isFinite(position) || position <= 0 || normalized.has(position)) {
      return { error: jsonError("La solicitud contiene variables desconocidas.", 400, "unknown_variable"), ok: false as const };
    }

    if (typeof rawValue !== "string") {
      return { error: jsonError("Todas las variables deben ser texto.", 400, "invalid_variable_value"), ok: false as const };
    }

    const text = rawValue.trim();

    if (!text) {
      return { error: jsonError("Todas las variables son obligatorias.", 400, "missing_variable"), ok: false as const };
    }

    if (text.length > MAX_TEMPLATE_VARIABLE_LENGTH) {
      return { error: jsonError("Una variable supera el largo maximo permitido.", 400, "variable_too_long"), ok: false as const };
    }

    normalized.set(position, text);
  }

  return { ok: true as const, variables: normalized };
}

function validateBodyVariables(template: SafeMetaWhatsappTemplate, value: unknown) {
  const expectedPositions = template.variables.map((variable) => variable.position).sort((left, right) => left - right);

  if (expectedPositions.length === 0) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0) {
      return { error: jsonError("Esta plantilla no acepta variables.", 400, "unknown_variable"), ok: false as const };
    }

    return { ok: true as const, variables: [] as TemplateVariableValue[] };
  }

  const normalized = normalizeVariables(value);

  if (!normalized.ok) return normalized;

  for (const position of expectedPositions) {
    if (!normalized.variables.has(position)) {
      return { error: jsonError("Faltan variables obligatorias.", 400, "missing_variable"), ok: false as const };
    }
  }

  for (const position of normalized.variables.keys()) {
    if (!expectedPositions.includes(position)) {
      return { error: jsonError("La solicitud contiene variables desconocidas.", 400, "unknown_variable"), ok: false as const };
    }
  }

  return {
    ok: true as const,
    variables: expectedPositions.map((position) => ({ position, text: normalized.variables.get(position) ?? "" })),
  };
}

function buildBodyComponents(variables: TemplateVariableValue[]) {
  if (variables.length === 0) return undefined;

  return [
    {
      parameters: variables.map((variable) => ({
        text: variable.text,
        type: "text" as const,
      })),
      type: "body" as const,
    },
  ];
}

function renderPreviewText(value: string | null, variables: TemplateVariableValue[]) {
  if (!value) return null;

  const valuesByPlaceholder = new Map(variables.map((variable) => [`{{${variable.position}}}`, variable.text]));

  return value.replace(/\{\{\s*(\d+)\s*\}\}/g, (placeholder, position) => valuesByPlaceholder.get(`{{${position}}}`) ?? placeholder);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const { id } = await context.params;
  const cartId = id.trim();

  if (!UUID_RE.test(cartId)) {
    return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");
  }

  let payload: SendTemplateDryRunRequest;

  try {
    payload = (await request.json()) as SendTemplateDryRunRequest;
  } catch {
    return jsonError("Debes enviar JSON valido.", 400, "invalid_payload");
  }

  if (!hasOnlyAllowedPayloadKeys(payload)) {
    return jsonError("La solicitud contiene campos no permitidos.", 400, "unknown_payload_field");
  }

  if (payload.dryRun !== true) {
    return jsonError("Esta operacion solo esta disponible en modo dry-run.", 400, "dry_run_required");
  }

  const templateKey = safeString(payload.templateKey);
  const language = safeString(payload.language);

  if (!templateKey || !language) {
    return jsonError("Debes indicar plantilla e idioma.", 400, "invalid_template");
  }

  const cartResult = await loadCart(admin.supabase, cartId);

  if (!cartResult.ok) {
    return cartResult.error;
  }

  if (!cartResult.cart.phone_normalized) {
    return jsonError("El carrito no tiene telefono normalizado.", 409, "business_key_unverifiable");
  }

  const windowState = await getWhatsappFreeformWindowForCart(admin.supabase, cartResult.cart.id);

  if (windowState.status === "unverifiable" || !isSupportedBusinessKey(windowState.businessKey)) {
    return jsonError("No fue posible verificar el negocio de la conversacion de WhatsApp.", 409, "business_key_unverifiable");
  }

  const businessKey = windowState.businessKey;
  let templates: SafeMetaWhatsappTemplate[];

  try {
    templates = await fetchMetaWhatsappTemplatesForBusiness(businessKey);
  } catch {
    return jsonError("No se pudieron validar templates de WhatsApp.", 500, "meta_templates_unavailable");
  }

  const template = findTemplate(templates, templateKey, language);

  if (!template) {
    return jsonError("La plantilla seleccionada no esta disponible para esta conversacion.", 409, "template_not_allowed");
  }

  if (template.status !== "APPROVED") {
    return jsonError("La plantilla seleccionada no esta aprobada.", 409, "template_not_approved");
  }

  if (templateHasUnsupportedVariables(template)) {
    return jsonError("La plantilla contiene variables no soportadas en esta etapa.", 409, "unsupported_template_variables");
  }

  const variablesResult = validateBodyVariables(template, payload.variables);

  if (!variablesResult.ok) {
    return variablesResult.error;
  }

  const components = buildBodyComponents(variablesResult.variables);
  const previewBody = renderPreviewText(template.preview.body, variablesResult.variables);
  const n8nPayloadPreview = {
    components,
    language: template.language,
    mode: "template" as const,
    source: "recovery_web" as const,
    templateName: template.name,
  };

  return NextResponse.json({
    dryRun: true,
    n8nPayloadPreview,
    ok: true,
    preview: {
      body: previewBody,
      buttons: template.preview.buttons,
      footer: template.preview.footer,
      header: template.preview.header,
    },
    validation: {
      businessKey,
      cartType: cartResult.cart.type,
      language: template.language,
      maskedPhone: maskPhone(cartResult.cart.phone_normalized),
      templateName: template.name,
      variableCount: variablesResult.variables.length,
    },
  });
}