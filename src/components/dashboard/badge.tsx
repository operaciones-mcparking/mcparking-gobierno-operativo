export type BadgeTone = "success" | "info" | "warning" | "danger" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  danger: "bg-[#ffe6ca] text-[#86510d]",
  info: "bg-[#e8f4f7] text-sea",
  neutral: "bg-mist text-slate-600",
  success: "bg-[#e4f4ea] text-[#24613d]",
  warning: "bg-[#fff2c9] text-[#755300]",
};

const criticalityLabels: Record<string, { label: string; tone: BadgeTone }> = {
  critical: { label: "Crítico", tone: "danger" },
  high: { label: "Alto", tone: "warning" },
  low: { label: "Bajo", tone: "success" },
  medium: { label: "Medio", tone: "info" },
};

const statusLabels: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Activo", tone: "success" },
  archived: { label: "Archivado", tone: "neutral" },
  draft: { label: "Borrador", tone: "warning" },
  inactive: { label: "Inactivo", tone: "neutral" },
};

const documentationLabels: Record<string, { label: string; tone: BadgeTone }> = {
  complete: { label: "Completa", tone: "success" },
  documented: { label: "Documentada", tone: "success" },
  draft: { label: "Borrador", tone: "warning" },
  missing: { label: "Pendiente", tone: "danger" },
  needs_update: { label: "Requiere actualización", tone: "warning" },
  not_started: { label: "No iniciada", tone: "danger" },
};

const relationshipLabels: Record<string, { label: string; tone: BadgeTone }> = {
  internal_unit: { label: "Unidad interna", tone: "info" },
  partner: { label: "Aliado", tone: "warning" },
  service_client: { label: "Cliente de servicio", tone: "success" },
};

function fallbackLabel(value: string | null | undefined) {
  if (!value) {
    return { label: "Sin datos", tone: "neutral" as BadgeTone };
  }

  return { label: value, tone: "neutral" as BadgeTone };
}

export function getBadgeLabel(
  type: "criticality" | "documentation" | "relationship" | "status",
  value: string | null | undefined,
) {
  const normalized = value?.toLowerCase();

  if (type === "criticality" && normalized) {
    return criticalityLabels[normalized] ?? fallbackLabel(value);
  }

  if (type === "documentation" && normalized) {
    return documentationLabels[normalized] ?? fallbackLabel(value);
  }

  if (type === "relationship" && normalized) {
    return relationshipLabels[normalized] ?? fallbackLabel(value);
  }

  if (type === "status" && normalized) {
    return statusLabels[normalized] ?? fallbackLabel(value);
  }

  return fallbackLabel(value);
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function TypedBadge({
  type,
  value,
}: {
  type: "criticality" | "documentation" | "relationship" | "status";
  value: string | null | undefined;
}) {
  const badge = getBadgeLabel(type, value);

  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}

export function ValueBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export const criticalityOptions = [
  { value: "low", label: "Bajo" },
  { value: "medium", label: "Medio" },
  { value: "high", label: "Alto" },
  { value: "critical", label: "Crítico" },
];

export const statusOptions = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
  { value: "archived", label: "Archivado" },
];

export const documentationOptions = [
  { value: "not_started", label: "No iniciada" },
  { value: "draft", label: "Borrador" },
  { value: "documented", label: "Documentada" },
  { value: "needs_update", label: "Requiere actualización" },
];

export const roleLevelOptions = [
  { value: "operational", label: "Operativo" },
  { value: "tactical", label: "Táctico" },
  { value: "strategic", label: "Estratégico" },
  { value: "executive", label: "Ejecutivo" },
  { value: "board", label: "Directorio" },
];

export const responsibilityOptions = [
  { value: "owner", label: "Dueño" },
  { value: "responsible", label: "Responsable" },
  { value: "executor", label: "Ejecutor" },
  { value: "approver", label: "Aprobador" },
  { value: "user", label: "Usuario" },
  { value: "consulted", label: "Consultado" },
  { value: "informed", label: "Informado" },
  { value: "backup", label: "Respaldo" },
];

export function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) {
    return "Sin datos";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}
