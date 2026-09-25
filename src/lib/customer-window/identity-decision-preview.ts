import type {
  CustomerWindowIdentityResolutionDetailV2,
  CustomerWindowRelatedReviewGroupV2,
  CustomerWindowSafeCount,
} from "@/lib/customer-window/customer-representations-v2";

export type CustomerIdentityDecision = "confirm_same_identity" | "keep_related" | "keep_separate" | "shared_account";
export type CustomerIdentityDecisionPreviewStatus = "informational" | "potentially_safe" | "requires_additional_contract" | "blocked";

export type CustomerIdentityDecisionPreview = {
  blockers: string[];
  candidateLinks: CustomerWindowSafeCount;
  canonicalProfileSafe: boolean;
  changes: string[];
  conflictLinks: CustomerWindowSafeCount;
  decision: CustomerIdentityDecision;
  merge: "Sí, potencialmente" | "No" | "Indeterminado";
  profiles: CustomerWindowSafeCount;
  reservations: CustomerWindowSafeCount;
  singleProfileOperation: "Sí" | "No" | "Indeterminado";
  status: CustomerIdentityDecisionPreviewStatus;
  summary: string;
  unchanged: string[];
};

export const CUSTOMER_IDENTITY_DECISION_LABELS: Record<CustomerIdentityDecision, string> = {
  confirm_same_identity: "Confirmar misma identidad",
  keep_related: "Mantener relacionados",
  keep_separate: "Mantener separados",
  shared_account: "Cuenta compartida / terceros",
};

function asBigInt(value: CustomerWindowSafeCount | undefined) {
  return BigInt(value ?? 0);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function deriveCustomerIdentityDecisionPreview(
  decision: CustomerIdentityDecision,
  detail: CustomerWindowIdentityResolutionDetailV2 | null,
  group: CustomerWindowRelatedReviewGroupV2 | null,
): CustomerIdentityDecisionPreview {
  const summary = detail?.summary ?? group;
  const profiles = summary?.profileCount ?? 0;
  const reservations = summary?.bookingCount ?? 0;
  const conflictLinks = summary?.conflictCount ?? 0;
  const candidateLinks = summary?.candidateCount ?? 0;
  const profileCount = asBigInt(profiles);
  const bookingCount = asBigInt(reservations);
  const hasCompleteDetail = detail !== null && BigInt(detail.members.length) === bookingCount;
  const hasMergedProfile = detail?.profiles.some((profile) => profile.status === "merged" || profile.mergedIntoProfileId !== null) ?? false;
  const hasBlockedProfile = detail?.profiles.some((profile) => profile.status === "blocked") ?? false;
  const hasContradictorySignals = detail?.events.some((event) => event.reason === "contradictory_phone_email" || event.evidence.contradictorySignals === true) ?? false;
  const hasMixedLinkStatuses = asBigInt(conflictLinks) > BigInt(0) && asBigInt(candidateLinks) > BigInt(0);
  const memberProfileIds = new Set(detail?.members.map((member) => member.profileId) ?? []);
  const onlyProfile = detail?.profiles.length === 1 ? detail.profiles[0] : null;
  const canonicalProfileSafe = Boolean(
    hasCompleteDetail
      && profileCount === BigInt(1)
      && onlyProfile?.status === "active"
      && onlyProfile.mergedIntoProfileId === null
      && memberProfileIds.size === 1
      && memberProfileIds.has(onlyProfile.profileId),
  );
  const sharedAccountSignals = asBigInt(summary?.emailCount) === BigInt(1)
    && asBigInt(summary?.phoneCount) > BigInt(1)
    && profileCount > BigInt(1)
    && bookingCount >= BigInt(4);
  const unchanged = [
    "El snapshot activo nunca se modificaría directamente.",
    "Las reservas fuente y sus datos observados permanecerían intactos.",
    "Cualquier efecto aparecería en un snapshot futuro solo después de un refresh validado.",
  ];

  if (decision === "confirm_same_identity") {
    const blockers: string[] = [];
    if (!hasCompleteDetail) blockers.push("Completar la evidencia de miembros y perfiles del grupo.");
    if (hasMergedProfile || hasBlockedProfile) blockers.push("Resolver los perfiles merged o blocked antes de evaluar una consolidación.");
    if (profileCount > BigInt(1)) blockers.push("Determinar un canonical profile seguro sin inferirlo desde la UI.", "Validar un merge SAFE para cada perfil redundante.");
    if (hasContradictorySignals) blockers.push("Resolver las señales históricas contradictorias.");
    if (hasMixedLinkStatuses) blockers.push("Validar la mezcla de links conflict y candidate.");
    if ((detail?.events.length ?? 0) === 0) blockers.push("Corroborar la decisión con evidencia histórica suficiente.");
    blockers.push("Implementar y auditar el contrato de escritura e idempotencia de esta decisión.");
    const status: CustomerIdentityDecisionPreviewStatus = !hasCompleteDetail || hasMergedProfile || hasBlockedProfile
      ? "blocked"
      : canonicalProfileSafe && !hasContradictorySignals && !hasMixedLinkStatuses
        ? "potentially_safe"
        : "requires_additional_contract";
    return {
      blockers: unique(blockers),
      candidateLinks,
      canonicalProfileSafe,
      changes: profileCount === BigInt(1)
        ? [
          `Hasta ${String(bookingCount)} links del grupo requerirían reconciliación con el perfil único.`,
          "Las métricas del perfil deberían recalcularse.",
          "El próximo snapshot podría reflejar confirmed_customer solo si todos los contratos se cumplen.",
        ]
        : [
          "Habría que seleccionar un canonical profile mediante guardas de servidor.",
          "Los demás perfiles podrían requerir merges SAFE atómicos.",
          `Hasta ${String(bookingCount)} links del grupo requerirían reconciliación y las métricas deberían recalcularse.`,
        ],
      conflictLinks,
      decision,
      merge: profileCount === BigInt(1) ? "No" : profileCount > BigInt(1) ? "Sí, potencialmente" : "Indeterminado",
      profiles,
      reservations,
      singleProfileOperation: profileCount === BigInt(1) ? "Sí" : profileCount > BigInt(1) ? "No" : "Indeterminado",
      status,
      summary: "Si eligieras esta decisión, las reservas se tratarían conceptualmente como una misma identidad. La vista previa no confirma que esa sea la decisión correcta.",
      unchanged,
    };
  }

  if (decision === "keep_related") {
    return {
      blockers: hasCompleteDetail
        ? ["Definir una decisión humana persistente que el resolver futuro pueda respetar."]
        : ["Completar la evidencia del grupo.", "Definir una decisión humana persistente que el resolver futuro pueda respetar."],
      candidateLinks,
      canonicalProfileSafe: false,
      changes: [
        "Los perfiles permanecerían separados y las reservas seguirían agrupadas analíticamente.",
        "La representación seguiría siendo related_review.",
        "Una implementación futura registraría la decisión humana sin activar una identidad física.",
      ],
      conflictLinks,
      decision,
      merge: "No",
      profiles,
      reservations,
      singleProfileOperation: profileCount === BigInt(1) ? "Sí" : "No",
      status: hasCompleteDetail ? "informational" : "blocked",
      summary: "Si eligieras esta decisión, se conservaría la relación analítica actual sin afirmar que los perfiles pertenecen a una misma persona.",
      unchanged,
    };
  }

  if (decision === "keep_separate") {
    return {
      blockers: [
        ...(hasCompleteDetail ? [] : ["Completar la evidencia del grupo."]),
        "Definir una regla persistente de separación que aún no está implementada.",
        "Definir cómo el resolver evitará reagrupar estas reservas en el futuro.",
      ],
      candidateLinks,
      canonicalProfileSafe: false,
      changes: [
        "El grupo actual dejaría de representar una unidad analítica común.",
        "Los perfiles y las reservas permanecerían separados.",
        "No se modificaría el snapshot actual; un snapshot futuro reflejaría la separación.",
      ],
      conflictLinks,
      decision,
      merge: "No",
      profiles,
      reservations,
      singleProfileOperation: "No",
      status: hasCompleteDetail ? "requires_additional_contract" : "blocked",
      summary: "Si eligieras esta decisión, el sistema necesitaría preservar explícitamente que estas reservas no deben volver a agruparse.",
      unchanged,
    };
  }

  return {
    blockers: [
      ...(hasCompleteDetail ? [] : ["Completar la evidencia del grupo."]),
      "Clasificación aún no persistible: falta definir un campo y contrato para esta decisión humana.",
      ...(sharedAccountSignals ? [] : ["Corroborar señales suficientes de cuenta compartida o reservas para terceros."]),
    ],
    candidateLinks,
    canonicalProfileSafe: false,
    changes: [
      "Los perfiles podrían permanecer separados y vinculados solo en la capa comercial o analítica.",
      "El grupo podría conservarse como related_review con una clasificación humana adicional.",
      "No se afirmaría que todas las reservas pertenecen a una misma persona.",
    ],
    conflictLinks,
    decision,
    merge: "No",
    profiles,
    reservations,
    singleProfileOperation: "No",
    status: hasCompleteDetail ? "requires_additional_contract" : "blocked",
    summary: "Si eligieras esta decisión, el patrón se interpretaría como una posible cuenta común usada por varias personas o para reservas de terceros, sin concluir identidad física.",
    unchanged,
  };
}
