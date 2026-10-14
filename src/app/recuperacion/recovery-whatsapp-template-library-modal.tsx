"use client";

import { Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ValueBadge } from "@/components/dashboard/badge";

export type RecoveryTemplatePreview = {
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
  previewMedia?: {
    format: "DOCUMENT" | "IMAGE" | "VIDEO";
    link: string | null;
    source: "meta_example" | "selected_media";
  } | null;
};

export type RecoveryTemplateParameter = {
  component: "BODY" | "BUTTON" | "HEADER";
  id: string;
  label: string;
  name: string | null;
  needsInput: boolean;
  placeholder: string;
  position: number | null;
  predefinedValue: string | null;
  required: boolean;
  supported: boolean;
  type: "document" | "image" | "text" | "video";
};

export type RecoveryTemplateOption = {
  category: string | null;
  compatibility?: {
    reasons: string[];
    status: "blocked" | "supported";
  };
  isFavorite: boolean;
  key: string;
  label: string;
  language: string;
  media?: {
    configured: boolean;
    format: "DOCUMENT" | "IMAGE" | "VIDEO" | null;
    previewOnly: boolean;
    required: boolean;
    source: "google_drive" | "https_url" | "meta_media_id" | null;
    validationError?: string | null;
  };
  mediaSelection?: RecoveryTemplateMediaSelection;
  name: string;
  parameterFormat?: "NAMED" | "POSITIONAL" | "UNKNOWN";
  parameters?: RecoveryTemplateParameter[];
  preview: RecoveryTemplatePreview;
  status: "APPROVED";
  variables: Array<{
    component?: "BODY" | "HEADER";
    id?: string;
    name?: string | null;
    placeholder: string;
    position: number;
  }>;
};

export type RecoveryTemplateMediaSelection = {
  format: "DOCUMENT" | "IMAGE" | "VIDEO";
  id: string | null;
  label: string | null;
  link: string | null;
  previewUrl?: string | null;
  source: "google_drive" | "https_url" | "meta_media_id";
};

type RecoveryTemplateMediaLibraryItem = {
  contentType: string;
  driveFileId: string;
  format: "DOCUMENT" | "IMAGE" | "VIDEO";
  label: string;
  name: string;
  previewUrl?: string;
  sendUrl: string;
  sizeBytes: number;
  source: "google_drive";
};

type RecoveryTemplateMediaLibraryResponse = {
  error?: string;
  items?: RecoveryTemplateMediaLibraryItem[];
  ok: boolean;
};

type RecoveryTemplateMediaValidationResponse = {
  code?: string;
  error?: string;
  media?: RecoveryTemplateMediaSelection;
  ok: boolean;
};

type RecoveryTemplatesResponse = {
  business?: {
    key: "MPV" | "EAP";
    label: string;
  };
  error?: string;
  ok: boolean;
  templates?: RecoveryTemplateOption[];
};

type RecoveryWhatsappTemplateLibraryModalProps = {
  cartId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: RecoveryTemplateOption) => void;
  selectedTemplateKey: string | null;
};

const FAVORITE_CATEGORY = "Favoritas";
const ALL_CATEGORIES = "Todas";
const ALL_LANGUAGES = "Todos";

export function categoryLabel(category: string | null) {
  const normalized = (category ?? "").trim().toUpperCase();

  if (normalized === "MARKETING") return "Marketing";
  if (normalized === "UTILITY") return "Utility";
  if (normalized === "AUTHENTICATION") return "Authentication";

  return normalized ? normalized.charAt(0) + normalized.slice(1).toLowerCase() : "Otra";
}

export function renderTemplatePreviewText(text: string | null, values: Record<string, string>) {
  if (!text) return null;

  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (placeholder, positionValue) => {
    const position = Number.parseInt(positionValue, 10);
    const value = values[position] ?? values[String(position)];

    return typeof value === "string" && value.trim().length > 0 ? value : placeholder;
  }).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (placeholder, name) => {
    const value = values[name];

    return typeof value === "string" && value.trim().length > 0 ? value : placeholder;
  });
}
function previewText(template: RecoveryTemplateOption) {
  return [
    template.name,
    template.label,
    template.category ?? "",
    template.language,
    template.preview.header ?? "",
    template.preview.previewMedia?.format ?? template.preview.headerMedia?.format ?? "",
    template.preview.body ?? "",
    template.preview.footer ?? "",
    ...template.preview.buttons.map((button) => button.text),
  ].join(" ");
}

function TemplatePreviewCard({
  isFavoritePending,
  isSelected,
  manualUrl,
  mediaLibrary,
  mediaSelection,
  mediaSelectionDirty,
  mediaValidationError,
  mediaValidationPending,
  onManualUrlChange,
  onFavoriteClick,
  onMediaLibrarySelect,
  onMediaSelectionSave,
  onMediaUrlValidate,
  onSelect,
  template,
}: {
  isFavoritePending: boolean;
  isSelected: boolean;
  manualUrl: string;
  mediaLibrary: RecoveryTemplateMediaLibraryItem[];
  mediaSelection: RecoveryTemplateMediaSelection | null;
  mediaSelectionDirty: boolean;
  mediaValidationError: string | null;
  mediaValidationPending: boolean;
  onManualUrlChange: (value: string) => void;
  onFavoriteClick: () => void;
  onMediaLibrarySelect: (item: RecoveryTemplateMediaLibraryItem) => void;
  onMediaSelectionSave: () => void;
  onMediaUrlValidate: () => void;
  onSelect: () => void;
  template: RecoveryTemplateOption;
}) {
  const hasPreview = Boolean(template.preview.header || template.preview.body || template.preview.footer || template.preview.buttons.length > 0);
  const isMissingMediaBlocked = template.compatibility?.status === "blocked"
    && template.compatibility.reasons.every((reason) => reason.toLowerCase().includes("requiere") && reason.toLowerCase().includes("para enviarse"));
  const isBlocked = template.compatibility?.status === "blocked" && !isMissingMediaBlocked;
  const favoriteLabel = template.isFavorite ? "Quitar de favoritas" : "Agregar a favoritas";
  const displayMedia = mediaSelection?.link
    ? { format: mediaSelection.format, link: mediaSelection.previewUrl ?? mediaSelection.link, source: "selected_media" as const }
    : template.preview.previewMedia ?? (template.preview.headerMedia ? { ...template.preview.headerMedia, source: "meta_example" as const } : null);
  const effectiveMediaValidationError = mediaValidationError ?? template.media?.validationError ?? null;
  const requiresMedia = Boolean(template.media?.required);
  const expectedMediaFormat = template.media?.format;

  return (
    <article
      className={"relative min-w-0 max-w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition " + (
        isSelected ? "border-teal-600 ring-2 ring-teal-100" : "border-[#d8e7e1] hover:border-teal-300 hover:shadow-md"
      )}
    >
      <button
        aria-pressed={isSelected}
        className="group grid w-full min-w-0 max-w-full gap-3 p-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500"
        onClick={onSelect}
        type="button"
      >
        <div className="flex min-w-0 items-start justify-between gap-2 pr-10">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy">{template.label}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{template.name}</p>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-1">
            <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]"><ValueBadge tone="success">{categoryLabel(template.category)}</ValueBadge></span>
            <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]"><ValueBadge tone="neutral">{template.language}</ValueBadge></span>
          </div>
        </div>

        <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-[#eef7f4] p-3">
          <div className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-2xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
            {hasPreview || displayMedia ? (
              <>
                {displayMedia ? (
                  displayMedia.format === "IMAGE" && displayMedia.link ? (
                    <img
                      alt=""
                      className="max-h-40 w-full rounded-xl object-cover"
                      src={displayMedia.link}
                    />
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      Header {displayMedia.format.toLowerCase()} aprobado por Meta
                    </p>
                  )
                ) : null}
                {template.preview.header ? <p className="min-w-0 max-w-full break-words font-semibold text-navy [overflow-wrap:anywhere]">{template.preview.header}</p> : null}
                {template.preview.body ? <p className="min-w-0 max-w-full whitespace-pre-wrap break-words leading-5 [overflow-wrap:anywhere]">{template.preview.body}</p> : null}
                {template.preview.footer ? <p className="min-w-0 max-w-full break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{template.preview.footer}</p> : null}
                {template.preview.buttons.length > 0 ? (
                  <div className="grid min-w-0 max-w-full gap-1 overflow-hidden border-t border-slate-100 pt-2">
                    {template.preview.buttons.map((button, index) => (
                      <span key={button.type + "-" + button.text + "-" + index} className="min-w-0 max-w-full break-words rounded-lg bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-teal-700 [overflow-wrap:anywhere]">
                        {button.text}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm font-medium text-slate-500">Vista previa no disponible</p>
            )}
          </div>
        </div>

        {template.variables.length > 0 ? (
          <div className="flex min-w-0 max-w-full flex-wrap gap-1 overflow-hidden text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Variables:</span>
            {template.variables.map((variable) => (
              <span key={variable.position} className="min-w-0 max-w-full break-words rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 [overflow-wrap:anywhere]">
                {variable.placeholder}
              </span>
            ))}
          </div>
        ) : null}
        {isBlocked ? (
          <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]">
            No disponible: {template.compatibility?.reasons[0] ?? "componente no soportado"}.
          </p>
        ) : null}
        {template.media?.required ? (
          !mediaSelection && !template.media.configured ? (
            <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]">
              Este template requiere una imagen. Selecciona una de tu biblioteca o ingresa una URL.
            </p>
          ) : null
        ) : null}
      </button>

      {requiresMedia && expectedMediaFormat === "IMAGE" ? (
        <div className="grid gap-2 border-t border-slate-100 px-3 pb-3 pt-2">
          <p className="text-xs font-semibold text-slate-600">Seleccionar imagen de biblioteca</p>
          <div className="flex min-w-0 flex-wrap gap-2">
            {mediaLibrary.slice(0, 6).map((item) => (
              <button
                className={"grid w-20 gap-1 rounded-xl border p-1 text-left text-[10px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500 " + (
                  mediaSelection?.link === item.sendUrl ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                )}
                key={item.driveFileId}
                onClick={() => onMediaLibrarySelect(item)}
                title={item.name}
                type="button"
              >
                <img alt="" className="h-12 w-full rounded-lg object-cover" src={item.previewUrl ?? item.sendUrl} />
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            URL HTTPS de imagen
            <span className="flex min-w-0 gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-xl border border-[#d8e7e1] px-3 text-xs font-medium text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => onManualUrlChange(event.target.value)}
                placeholder="https://drive.google.com/uc?export=download&id=..."
                type="url"
                value={manualUrl}
              />
              <button
                className="rounded-xl border border-teal-200 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-wait disabled:text-slate-400"
                disabled={mediaValidationPending || !manualUrl.trim()}
                onClick={onMediaUrlValidate}
                type="button"
              >
                {mediaValidationPending ? "Validando..." : "Validar"}
              </button>
            </span>
          </label>
          {effectiveMediaValidationError ? (
            <p className="rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#92400e]">
              {effectiveMediaValidationError}
            </p>
          ) : null}
          {mediaValidationPending ? (
            <p className="text-xs font-semibold text-slate-500">Validando imagen...</p>
          ) : null}
          {mediaSelection && mediaSelectionDirty ? (
            <button
              className="justify-self-start rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-300 disabled:text-slate-600"
              disabled={mediaValidationPending}
              onClick={onMediaSelectionSave}
              type="button"
            >
              Guardar selección
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        aria-label={favoriteLabel + ": " + template.label}
        className={"absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-wait disabled:opacity-60 " + (
          template.isFavorite ? "border-amber-300 text-amber-500" : "border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-500"
        )}
        disabled={isFavoritePending}
        onClick={onFavoriteClick}
        title={favoriteLabel}
        type="button"
      >
        <Star className="h-4 w-4" fill={template.isFavorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

export function RecoveryWhatsappTemplateLibraryModal({
  cartId,
  isOpen,
  onClose,
  onSelectTemplate,
  selectedTemplateKey,
}: RecoveryWhatsappTemplateLibraryModalProps) {
  const [businessLabel, setBusinessLabel] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(FAVORITE_CATEGORY);
  const [error, setError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteToRemove, setFavoriteToRemove] = useState<RecoveryTemplateOption | null>(null);
  const [languageFilter, setLanguageFilter] = useState(ALL_LANGUAGES);
  const [manualMediaUrls, setManualMediaUrls] = useState<Record<string, string>>({});
  const [mediaLibrary, setMediaLibrary] = useState<RecoveryTemplateMediaLibraryItem[]>([]);
  const [mediaSelections, setMediaSelections] = useState<Record<string, RecoveryTemplateMediaSelection>>({});
  const [mediaSavePendingKey, setMediaSavePendingKey] = useState<string | null>(null);
  const [mediaValidationErrors, setMediaValidationErrors] = useState<Record<string, string>>({});
  const [mediaValidationPendingKey, setMediaValidationPendingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingFavoriteKey, setPendingFavoriteKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(selectedTemplateKey);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [templates, setTemplates] = useState<RecoveryTemplateOption[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (favoriteToRemove) {
        if (!pendingFavoriteKey) setFavoriteToRemove(null);
        return;
      }
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [favoriteToRemove, isOpen, onClose, pendingFavoriteKey]);

  useEffect(() => {
    if (!isOpen || !cartId) return;

    const activeCartId = cartId;
    const controller = new AbortController();
    let isActive = true;

    async function loadTemplates() {
      setBusinessLabel(null);
      setCategoryFilter(FAVORITE_CATEGORY);
      setError(null);
      setFavoriteError(null);
      setFavoriteToRemove(null);
      setLanguageFilter(ALL_LANGUAGES);
      setManualMediaUrls({});
      setMediaLibrary([]);
      setMediaSavePendingKey(null);
      setMediaSelections({});
      setMediaValidationErrors({});
      setMediaValidationPendingKey(null);
      setQuery("");
      setPendingFavoriteKey(null);
      setSelectedKey(selectedTemplateKey);
      setStatus("loading");
      setTemplates([]);

      try {
        const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(activeCartId)}/chat/templates`, {
          method: "GET",
          signal: controller.signal,
        });
        const payload = (await response.json()) as RecoveryTemplatesResponse;

        if (!response.ok || !payload.ok) {
          if (isActive) {
            setBusinessLabel(payload.business?.label ?? null);
            setError(response.status === 409 ? "No se puede determinar el número de WhatsApp de esta conversación." : "No se pudieron cargar las plantillas.");
            setStatus("error");
          }
          return;
        }

        if (isActive) {
          const nextTemplates = payload.templates ?? [];
          setBusinessLabel(payload.business?.label ?? null);
          setTemplates(nextTemplates);
          setSelectedKey(selectedTemplateKey ?? nextTemplates[0]?.key ?? null);
          setStatus("loaded");
        }

        const needsMediaLibrary = (payload.templates ?? []).some((template) => template.media?.required && template.media.format === "IMAGE");
        if (needsMediaLibrary) {
          const mediaResponse = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(activeCartId)}/chat/templates/media-library`, {
            method: "GET",
            signal: controller.signal,
          });
          const mediaPayload = (await mediaResponse.json()) as RecoveryTemplateMediaLibraryResponse;

          if (isActive && mediaResponse.ok && mediaPayload.ok) {
            setMediaLibrary(mediaPayload.items ?? []);
          }
        }
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;

        if (isActive) {
          setError("No se pudieron cargar las plantillas.");
          setStatus("error");
        }
      }
    }

    void loadTemplates();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [cartId, isOpen, reloadToken, selectedTemplateKey]);

  async function addFavorite(template: RecoveryTemplateOption) {
    if (!cartId || pendingFavoriteKey) return;

    setFavoriteError(null);
    setPendingFavoriteKey(template.key);
    setTemplates((current) => current.map((item) => item.key === template.key ? { ...item, isFavorite: true } : item));

    try {
      const response = await fetch("/api/recuperacion/carritos/" + encodeURIComponent(cartId) + "/chat/templates/favorites", {
        body: JSON.stringify({ language: template.language, template_name: template.name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; isFavorite?: boolean; ok: boolean };

      if (!response.ok || !payload.ok || payload.isFavorite !== true) {
        throw new Error("favorite_create_failed");
      }
    } catch {
      setTemplates((current) => current.map((item) => item.key === template.key ? { ...item, isFavorite: false } : item));
      setFavoriteError("No se pudo agregar la plantilla a Favoritas.");
    } finally {
      setPendingFavoriteKey(null);
    }
  }

  async function removeFavorite(template: RecoveryTemplateOption) {
    if (!cartId || pendingFavoriteKey) return;

    setFavoriteError(null);
    setFavoriteToRemove(null);
    setPendingFavoriteKey(template.key);
    setTemplates((current) => current.map((item) => item.key === template.key ? { ...item, isFavorite: false } : item));

    try {
      const response = await fetch("/api/recuperacion/carritos/" + encodeURIComponent(cartId) + "/chat/templates/favorites", {
        body: JSON.stringify({ language: template.language, template_name: template.name }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string; isFavorite?: boolean; ok: boolean };

      if (!response.ok || !payload.ok || payload.isFavorite !== false) {
        throw new Error("favorite_delete_failed");
      }
    } catch {
      setTemplates((current) => current.map((item) => item.key === template.key ? { ...item, isFavorite: true } : item));
      setFavoriteError("No se pudo quitar la plantilla de Favoritas.");
    } finally {
      setPendingFavoriteKey(null);
    }
  }

  async function validateMediaSelection(template: RecoveryTemplateOption, media: {
    format: "DOCUMENT" | "IMAGE" | "VIDEO";
    label?: string | null;
    link: string;
    source: "google_drive" | "manual_url";
  }) {
    if (!cartId || !template.media?.format || mediaValidationPendingKey) return;

    setMediaValidationPendingKey(template.key);
    setMediaValidationErrors((current) => ({ ...current, [template.key]: "" }));

    try {
      const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/templates/media/validate`, {
        body: JSON.stringify({
          expectedFormat: template.media.format,
          media,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RecoveryTemplateMediaValidationResponse;

      if (!response.ok || !payload.ok || !payload.media) {
        setMediaValidationErrors((current) => ({
          ...current,
          [template.key]: payload.error ?? "No se pudo validar la imagen seleccionada.",
        }));
        return;
      }

      const validatedMedia = payload.media as RecoveryTemplateMediaSelection;
      setMediaSelections((current) => ({ ...current, [template.key]: validatedMedia }));
      setTemplates((current) => current.map((item) => item.key === template.key
        ? {
            ...item,
            compatibility: item.compatibility?.status === "blocked"
              ? { reasons: [], status: "supported" }
              : item.compatibility,
            media: item.media ? { ...item.media, configured: true, previewOnly: false, source: validatedMedia.source } : item.media,
          }
        : item));
    } catch {
      setMediaValidationErrors((current) => ({
        ...current,
        [template.key]: "No se pudo validar la imagen seleccionada.",
      }));
    } finally {
      setMediaValidationPendingKey(null);
    }
  }

  async function saveMediaSelection(template: RecoveryTemplateOption) {
    const media = mediaSelections[template.key];
    if (!cartId || !media || mediaSavePendingKey) return;

    setMediaSavePendingKey(template.key);
    setMediaValidationErrors((current) => ({ ...current, [template.key]: "" }));

    try {
      const response = await fetch(`/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/templates/media-config`, {
        body: JSON.stringify({
          language: template.language,
          media,
          template_name: template.name,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RecoveryTemplateMediaValidationResponse;

      if (!response.ok || !payload.ok || !payload.media) {
        setMediaValidationErrors((current) => ({
          ...current,
          [template.key]: payload.error ?? "No se pudo guardar la imagen seleccionada.",
        }));
        return;
      }

      const savedMedia = payload.media as RecoveryTemplateMediaSelection;
      setTemplates((current) => current.map((item) => item.key === template.key
        ? {
            ...item,
            compatibility: item.compatibility?.status === "blocked"
              ? { reasons: [], status: "supported" }
              : item.compatibility,
            media: item.media ? { ...item.media, configured: true, previewOnly: false, source: savedMedia.source } : item.media,
            mediaSelection: savedMedia,
          }
        : item));
      setMediaSelections((current) => {
        const next = { ...current };
        delete next[template.key];
        return next;
      });
    } catch {
      setMediaValidationErrors((current) => ({
        ...current,
        [template.key]: "No se pudo guardar la imagen seleccionada.",
      }));
    } finally {
      setMediaSavePendingKey(null);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const template of templates) {
      const label = categoryLabel(template.category);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return [
      { count: templates.filter((template) => template.isFavorite).length, label: FAVORITE_CATEGORY },
      { count: templates.length, label: ALL_CATEGORIES },
      ...[...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, count]) => ({ count, label })),
    ];
  }, [templates]);

  const languages = useMemo(() => {
    const values = [...new Set(templates.map((template) => template.language).filter(Boolean))].sort();
    return values.length > 1 ? [ALL_LANGUAGES, ...values] : values;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesCategory = categoryFilter === FAVORITE_CATEGORY
        ? template.isFavorite
        : categoryFilter === ALL_CATEGORIES || categoryLabel(template.category) === categoryFilter;
      const matchesLanguage = languageFilter === ALL_LANGUAGES || template.language === languageFilter;
      const matchesSearch = !normalizedQuery || previewText(template).toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesLanguage && matchesSearch;
    });
  }, [categoryFilter, languageFilter, query, templates]);

  const selectedTemplate = templates.find((template) => template.key === selectedKey) ?? null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation">
      <section
        aria-labelledby="recovery-template-library-title"
        aria-modal="true"
        className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-6xl sm:rounded-3xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Biblioteca WhatsApp</p>
            <h2 className="mt-1 text-lg font-semibold text-navy" id="recovery-template-library-title">
              Plantillas aprobadas por Meta
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona una plantilla para revisarla{businessLabel ? ` · ${businessLabel}` : ""}.
            </p>
          </div>
          <button
            aria-label="Cerrar biblioteca de plantillas"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d6e1ea] bg-white text-slate-600 transition hover:border-teal-300 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] overflow-hidden lg:grid-cols-[13rem_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Categorías</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
              {categoryCounts.map((category) => (
                <button
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500 lg:flex lg:justify-between lg:rounded-xl ${
                    categoryFilter === category.label ? "bg-teal-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-teal-700"
                  }`}
                  key={category.label}
                  onClick={() => setCategoryFilter(category.label)}
                  type="button"
                >
                  <span>{category.label}</span>
                  <span className="ml-1 opacity-75">({category.count})</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="grid min-h-0 min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden">
            <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-6">
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600" htmlFor="recovery-template-search">
                Buscar plantilla
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-10 w-full min-w-0 rounded-xl border border-[#d8e7e1] bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    id="recovery-template-search"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar plantilla..."
                    type="search"
                    value={query}
                  />
                </span>
              </label>

              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600" htmlFor="recovery-template-language">
                Idioma
                {languages.length > 1 ? (
                  <select
                    className="h-10 rounded-xl border border-[#d8e7e1] bg-white px-3 text-sm font-semibold text-navy outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    id="recovery-template-language"
                    onChange={(event) => setLanguageFilter(event.target.value)}
                    value={languageFilter}
                  >
                    {languages.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex h-10 items-center rounded-xl border border-[#d8e7e1] bg-white px-3 text-sm font-semibold text-navy">
                    {languages[0] ?? ALL_LANGUAGES}
                  </span>
                )}
              </label>
            </div>

            <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
              {favoriteError ? (
                <p className="mb-3 rounded-xl border border-[#f2d6a2] bg-[#fff8e8] px-3 py-2 text-sm font-medium text-[#92400e]" role="alert">
                  {favoriteError}
                </p>
              ) : null}
              {status === "loading" ? (
                <div className="rounded-2xl border border-[#d8e7e1] bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                  Cargando plantillas desde Meta...
                </div>
              ) : status === "error" ? (
                <div className="rounded-2xl border border-[#f2d6a2] bg-[#fff8e8] px-4 py-5 text-sm font-medium text-[#92400e]">
                  <p>{error ?? "No se pudieron cargar las plantillas."}</p>
                  <button className="mt-3 rounded-xl bg-[#92400e] px-3 py-2 text-xs font-semibold text-white" onClick={() => setReloadToken((value) => value + 1)} type="button">
                    Reintentar
                  </button>
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-2xl border border-[#d8e7e1] bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                  No hay plantillas aprobadas disponibles para este número.
                </div>
              ) : categoryFilter === FAVORITE_CATEGORY && templates.every((template) => !template.isFavorite) ? (
                <div className="rounded-2xl border border-[#d8e7e1] bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                  <p>Aún no tienes plantillas favoritas.</p>
                  <p className="mt-1">Ve a Todas y marca una plantilla con ★.</p>
                  <button
                    className="mt-3 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                    onClick={() => setCategoryFilter(ALL_CATEGORIES)}
                    type="button"
                  >
                    Ver todas las plantillas
                  </button>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-2xl border border-[#d8e7e1] bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                  No hay plantillas que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                  {filteredTemplates.map((template) => (
                    <TemplatePreviewCard
                      isFavoritePending={pendingFavoriteKey === template.key}
                      isSelected={selectedKey === template.key}
                      key={template.key}
                      manualUrl={manualMediaUrls[template.key] ?? ""}
                      mediaLibrary={mediaLibrary}
                      mediaSelection={mediaSelections[template.key] ?? template.mediaSelection ?? null}
                      mediaSelectionDirty={Boolean(mediaSelections[template.key])}
                      mediaValidationError={mediaValidationErrors[template.key] || null}
                      mediaValidationPending={mediaValidationPendingKey === template.key || mediaSavePendingKey === template.key}
                      onManualUrlChange={(value) => {
                        setManualMediaUrls((current) => ({ ...current, [template.key]: value }));
                        setMediaValidationErrors((current) => ({ ...current, [template.key]: "" }));
                      }}
                      onFavoriteClick={() => {
                        if (template.isFavorite) {
                          setFavoriteToRemove(template);
                        } else {
                          void addFavorite(template);
                        }
                      }}
                      onMediaLibrarySelect={(item) => {
                        void validateMediaSelection(template, {
                          format: item.format,
                          label: item.name,
                          link: item.sendUrl,
                          source: "google_drive",
                        });
                      }}
                      onMediaSelectionSave={() => void saveMediaSelection(template)}
                      onMediaUrlValidate={() => {
                        const link = manualMediaUrls[template.key]?.trim() ?? "";
                        if (!link || !template.media?.format) return;
                        void validateMediaSelection(template, {
                          format: template.media.format,
                          label: "URL manual",
                          link,
                          source: "manual_url",
                        });
                      }}
                      onSelect={() => setSelectedKey(template.key)}
                      template={mediaSelections[template.key] ? { ...template, mediaSelection: mediaSelections[template.key] } : template}
                    />
                  ))}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="min-w-0 text-sm font-medium text-slate-600">
                {selectedTemplate ? `Plantilla seleccionada: ${selectedTemplate.label}` : "Selecciona una plantilla para revisarla."}
              </p>
              <div className="flex gap-2">
                <button className="rounded-xl border border-[#d6e1ea] px-4 py-2 text-sm font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-700" onClick={onClose} type="button">
                  Cerrar
                </button>
                <button
                  className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  disabled={!selectedTemplate || selectedTemplate.compatibility?.status === "blocked"}
                  onClick={() => {
                    if (!selectedTemplate || selectedTemplate.compatibility?.status === "blocked") return;
                    const selectedMedia = mediaSelections[selectedTemplate.key] ?? selectedTemplate.mediaSelection ?? null;
                    onSelectTemplate(selectedMedia ? { ...selectedTemplate, mediaSelection: selectedMedia } : selectedTemplate);
                    onClose();
                  }}
                  type="button"
                >
                  Usar plantilla
                </button>
              </div>
            </footer>
          </main>
        </div>
      </section>

      {favoriteToRemove ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4" onClick={() => setFavoriteToRemove(null)}>
          <section
            aria-labelledby="remove-favorite-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 className="text-base font-semibold text-navy" id="remove-favorite-title">¿Quitar esta plantilla de Favoritas?</h3>
            <p className="mt-2 text-sm text-slate-600">{favoriteToRemove.label}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-teal-300 hover:text-teal-700"
                onClick={() => setFavoriteToRemove(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-[#92400e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7c2d12]"
                onClick={() => void removeFavorite(favoriteToRemove)}
                type="button"
              >
                Quitar de favoritas
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
