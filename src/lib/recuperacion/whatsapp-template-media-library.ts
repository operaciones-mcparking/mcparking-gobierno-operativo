import "server-only";

export type RecoveryWhatsappTemplateMediaFormat = "DOCUMENT" | "IMAGE" | "VIDEO";

export type RecoveryWhatsappTemplateMediaLibraryItem = {
  contentType: string;
  driveFileId: string;
  driveFolderId: string;
  format: RecoveryWhatsappTemplateMediaFormat;
  label: string;
  name: string;
  previewUrl?: string;
  sendUrl: string;
  sizeBytes: number;
  source: "google_drive";
};

export type RecoveryWhatsappTemplateSelectedMedia = {
  format: RecoveryWhatsappTemplateMediaFormat;
  id?: string | null;
  link?: string | null;
  label?: string | null;
  source?: "google_drive" | "https_url" | "meta_media_id" | "manual_url" | null;
};

type MediaValidationResult =
  | {
      media: {
        format: RecoveryWhatsappTemplateMediaFormat;
        id: string | null;
        link: string | null;
        label: string | null;
        source: "google_drive" | "https_url" | "meta_media_id";
      };
      ok: true;
    }
  | {
      code: string;
      message: string;
      ok: false;
    };

const DRIVE_FOLDER_ID = "1vEGvf5_SVamZek5xQ2FlfCMcatzQSxW9";
const MAX_REMOTE_MEDIA_BYTES = 5 * 1024 * 1024;
const REMOTE_VALIDATION_TIMEOUT_MS = 4_000;
const ALLOWED_MEDIA_HOSTS = new Set(["drive.google.com"]);

const DRIVE_IMAGE_ROWS: Array<[name: string, driveFileId: string, contentType: string, sizeBytes: number]> = [
  ["UTILIZAR_TARJETA.png", "1iDvaSNJoG1AeElp52USzKQNT-rVG8NKj", "image/png", 967889],
  ["7DAYSPACK.jpeg", "1ViMTzDxrDNgQwUhubNX6jP3xDU2-lLDE", "image/jpeg", 126123],
  ["PARKING40.jpeg", "1sdVLM1TmHVz_AkDjYl2H2QdqQW3MsNiJ", "image/jpeg", 58319],
  ["BILLETAZO.jpeg", "1GWJ86F-Ftuwd8Q1Hxwpqwv02E-5AhjOw", "image/jpeg", 60342],
  ["NOT_TERMINAL_AERO-1.png", "1oFA6BDTGq8xn8wZ2CRYxUOdWFJvos2l3", "image/png", 337889],
  ["PACK50-MENSAJEPACK1.png", "1f-_2d0nupT6Ew_rftn8NNcEvY7_YBDTT", "image/png", 13879],
  ["50DIAS1198.jpeg", "1l3Mw_4kGQuLJ8FiQxXolUgUOLC3lY8TF", "image/jpeg", 52167],
  ["FOTOEAP.jpeg", "1ZkuTq5Ux94-eCy9L3tB5SNkTgeJ0WDN2", "image/jpeg", 317435],
  ["CHECK_IN_MCP.jpeg", "1F_HcyEu63adhskYLoqXXam2sQfFj-fz-", "image/jpeg", 347415],
  ["FOTOMPV.jpeg", "1mIrkyx5YJVRT0D_XWzfHLjW9nImVZ4pT", "image/jpeg", 345228],
  ["FOTO_FIDELIZACION59900.jpeg", "1lBr4ccU0mpna6_mnpR6HLAfwNne4LI6c", "image/jpeg", 202790],
];

const DRIVE_IMAGES: RecoveryWhatsappTemplateMediaLibraryItem[] = DRIVE_IMAGE_ROWS.map(([name, driveFileId, contentType, sizeBytes]) => ({
  contentType,
  driveFileId,
  driveFolderId: DRIVE_FOLDER_ID,
  format: "IMAGE",
  label: String(name).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
  name,
  sendUrl: driveDownloadUrl(driveFileId),
  sizeBytes,
  source: "google_drive",
}));

function driveDownloadUrl(fileId: string) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFormat(value: unknown): RecoveryWhatsappTemplateMediaFormat | null {
  const format = safeString(value).toUpperCase();

  return format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT" ? format : null;
}

function driveFileIdFromUrl(url: URL) {
  if (url.hostname !== "drive.google.com") return null;

  const queryId = safeString(url.searchParams.get("id"));
  if (queryId) return queryId;

  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  return fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : null;
}

function normalizeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized.startsWith("10.")
    || normalized.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    || normalized.startsWith("169.254.");
}

function contentTypeMatchesFormat(contentType: string, expectedFormat: RecoveryWhatsappTemplateMediaFormat) {
  const normalized = contentType.toLowerCase();

  if (expectedFormat === "IMAGE") return normalized.startsWith("image/");
  if (expectedFormat === "VIDEO") return normalized.startsWith("video/");
  if (expectedFormat === "DOCUMENT") return normalized === "application/pdf" || normalized.startsWith("application/");

  return false;
}

export function listRecoveryWhatsappTemplateMediaLibrary() {
  return DRIVE_IMAGES;
}

export function recoveryWhatsappTemplateMediaLibraryItemByDriveFileId(fileId: string) {
  return DRIVE_IMAGES.find((item) => item.driveFileId === fileId) ?? null;
}

export async function fetchRecoveryWhatsappTemplateDrivePreview(fileId: string) {
  const item = recoveryWhatsappTemplateMediaLibraryItemByDriveFileId(fileId);
  if (!item) return { code: "media_not_found", ok: false as const };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(item.sendUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? item.contentType;
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? String(item.sizeBytes), 10);

    if (!response.ok || !contentTypeMatchesFormat(contentType, item.format)) {
      return { code: "media_unavailable", ok: false as const };
    }

    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_MEDIA_BYTES) {
      return { code: "media_too_large", ok: false as const };
    }

    return {
      body: await response.arrayBuffer(),
      contentType,
      ok: true as const,
    };
  } catch {
    return { code: "media_unavailable", ok: false as const };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeRecoveryWhatsappTemplateMediaSelection(value: unknown): RecoveryWhatsappTemplateSelectedMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as { format?: unknown; id?: unknown; label?: unknown; link?: unknown; source?: unknown; type?: unknown };
  const format = normalizeFormat(input.format ?? input.type);
  if (!format) return null;

  const id = safeString(input.id);
  const link = safeString(input.link);
  const label = safeString(input.label);
  const source = safeString(input.source).toLowerCase();

  if (id && (!source || source === "meta_media_id" || source === "id")) {
    return { format, id, label: label || null, link: null, source: "meta_media_id" };
  }

  if (link) {
    return {
      format,
      id: null,
      label: label || null,
      link,
      source: source === "google_drive" ? "google_drive" : source === "manual_url" ? "manual_url" : "https_url",
    };
  }

  return null;
}

export async function validateRecoveryWhatsappTemplateMediaSelection(
  value: unknown,
  expectedFormat: RecoveryWhatsappTemplateMediaFormat,
): Promise<MediaValidationResult> {
  const selection = normalizeRecoveryWhatsappTemplateMediaSelection(value);

  if (!selection) {
    return { code: "template_media_required", message: "Este template requiere una imagen valida antes de enviar.", ok: false };
  }

  if (selection.format !== expectedFormat) {
    return { code: "template_media_format_mismatch", message: "La imagen seleccionada no coincide con el formato requerido por Meta.", ok: false };
  }

  if (selection.id) {
    return {
      media: {
        format: selection.format,
        id: selection.id,
        label: selection.label ?? "Media ID Meta",
        link: null,
        source: "meta_media_id",
      },
      ok: true,
    };
  }

  const url = normalizeHttpsUrl(selection.link ?? "");
  if (!url) {
    return { code: "template_media_invalid_url", message: "La URL de imagen debe ser HTTPS.", ok: false };
  }

  if (isPrivateHostname(url.hostname)) {
    return { code: "template_media_unsafe_url", message: "La URL de imagen no es segura para envio.", ok: false };
  }

  const driveFileId = driveFileIdFromUrl(url);
  const libraryItem = driveFileId ? DRIVE_IMAGES.find((item) => item.driveFileId === driveFileId) ?? null : null;

  if (driveFileId && !libraryItem) {
    return { code: "template_media_drive_file_not_allowed", message: "La imagen de Drive no pertenece a la biblioteca autorizada.", ok: false };
  }

  if (libraryItem) {
    if (libraryItem.format !== expectedFormat) {
      return { code: "template_media_format_mismatch", message: "La imagen seleccionada no coincide con el formato requerido por Meta.", ok: false };
    }

    return {
      media: {
        format: libraryItem.format,
        id: null,
        label: libraryItem.name,
        link: libraryItem.sendUrl,
        source: "google_drive",
      },
      ok: true,
    };
  }

  if (!ALLOWED_MEDIA_HOSTS.has(url.hostname)) {
    return { code: "template_media_host_not_allowed", message: "La URL de imagen no pertenece a un dominio autorizado.", ok: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);

    if (!response.ok) {
      return { code: "template_media_unreachable", message: "No se pudo acceder a la imagen seleccionada.", ok: false };
    }

    if (!contentTypeMatchesFormat(contentType, expectedFormat)) {
      return { code: "template_media_wrong_content_type", message: "La URL seleccionada no devuelve una imagen valida.", ok: false };
    }

    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_MEDIA_BYTES) {
      return { code: "template_media_too_large", message: "La imagen seleccionada supera el tamano permitido.", ok: false };
    }

    return {
      media: {
        format: expectedFormat,
        id: null,
        label: selection.label ?? url.hostname,
        link: url.toString(),
        source: "https_url",
      },
      ok: true,
    };
  } catch {
    return { code: "template_media_unreachable", message: "No se pudo validar la imagen seleccionada.", ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
