"use client";

import { Search, X } from "lucide-react";
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
};

export type RecoveryTemplateOption = {
  category: string | null;
  key: string;
  label: string;
  language: string;
  name: string;
  preview: RecoveryTemplatePreview;
  status: "APPROVED";
  variables: Array<{
    placeholder: string;
    position: number;
  }>;
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

const ALL_CATEGORIES = "Todas";
const ALL_LANGUAGES = "Todos";

function categoryLabel(category: string | null) {
  const normalized = (category ?? "").trim().toUpperCase();

  if (normalized === "MARKETING") return "Marketing";
  if (normalized === "UTILITY") return "Utility";
  if (normalized === "AUTHENTICATION") return "Authentication";

  return normalized ? normalized.charAt(0) + normalized.slice(1).toLowerCase() : "Otra";
}

function previewText(template: RecoveryTemplateOption) {
  return [
    template.name,
    template.label,
    template.category ?? "",
    template.language,
    template.preview.header ?? "",
    template.preview.body ?? "",
    template.preview.footer ?? "",
    ...template.preview.buttons.map((button) => button.text),
  ].join(" ");
}

function TemplatePreviewCard({
  isSelected,
  onSelect,
  template,
}: {
  isSelected: boolean;
  onSelect: () => void;
  template: RecoveryTemplateOption;
}) {
  const hasPreview = Boolean(template.preview.header || template.preview.body || template.preview.footer || template.preview.buttons.length > 0);

  return (
    <button
      aria-pressed={isSelected}
      className={`group grid min-w-0 gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
        isSelected ? "border-teal-600 ring-2 ring-teal-100" : "border-[#d8e7e1] hover:border-teal-300 hover:shadow-md"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy">{template.label}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{template.name}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <ValueBadge tone="success">{categoryLabel(template.category)}</ValueBadge>
          <ValueBadge tone="neutral">{template.language}</ValueBadge>
        </div>
      </div>

      <div className="rounded-2xl bg-[#eef7f4] p-3">
        <div className="grid gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
          {hasPreview ? (
            <>
              {template.preview.header ? <p className="font-semibold text-navy">{template.preview.header}</p> : null}
              {template.preview.body ? <p className="whitespace-pre-wrap leading-5">{template.preview.body}</p> : null}
              {template.preview.footer ? <p className="text-xs text-slate-500">{template.preview.footer}</p> : null}
              {template.preview.buttons.length > 0 ? (
                <div className="grid gap-1 border-t border-slate-100 pt-2">
                  {template.preview.buttons.map((button, index) => (
                    <span key={`${button.type}-${button.text}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-teal-700">
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
        <div className="flex flex-wrap gap-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Variables:</span>
          {template.variables.map((variable) => (
            <span key={variable.position} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
              {variable.placeholder}
            </span>
          ))}
        </div>
      ) : null}
    </button>
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
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [error, setError] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState(ALL_LANGUAGES);
  const [query, setQuery] = useState("");
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
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !cartId) return;

    const activeCartId = cartId;
    const controller = new AbortController();
    let isActive = true;

    async function loadTemplates() {
      setBusinessLabel(null);
      setCategoryFilter(ALL_CATEGORIES);
      setError(null);
      setLanguageFilter(ALL_LANGUAGES);
      setQuery("");
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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const template of templates) {
      const label = categoryLabel(template.category);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return [
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
      const matchesCategory = categoryFilter === ALL_CATEGORIES || categoryLabel(template.category) === categoryFilter;
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

          <main className="grid min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden">
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

            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
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
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-2xl border border-[#d8e7e1] bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600">
                  No hay plantillas que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredTemplates.map((template) => (
                    <TemplatePreviewCard
                      isSelected={selectedKey === template.key}
                      key={template.key}
                      onSelect={() => setSelectedKey(template.key)}
                      template={template}
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
                  disabled={!selectedTemplate}
                  onClick={() => {
                    if (!selectedTemplate) return;
                    onSelectTemplate(selectedTemplate);
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
    </div>
  );
}
