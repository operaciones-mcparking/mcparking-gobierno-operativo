import "server-only";

import type { MetaWhatsappTemplateBusinessKey } from "./meta-whatsapp-templates";

export type RecoveryTemplateCatalogItem = {
  description: string;
  enabled: boolean;
  key: string;
  label: string;
  language: string;
  metaName: string;
};

export const RECOVERY_TEMPLATE_CATALOG: Record<MetaWhatsappTemplateBusinessKey, RecoveryTemplateCatalogItem[]> = {
  EAP: [
    {
      description: "Plantilla generica aprobada para recuperacion EAP.",
      enabled: true,
      key: "cp_generico_eap",
      label: "CP generico EAP",
      language: "es_CL",
      metaName: "cp_generico_eap",
    },
  ],
  MPV: [
    {
      description: "Plantilla generica aprobada para recuperacion MPV.",
      enabled: true,
      key: "cp_generico",
      label: "CP generico",
      language: "es_CL",
      metaName: "cp_generico",
    },
  ],
};

function cloneTemplate(template: RecoveryTemplateCatalogItem): RecoveryTemplateCatalogItem {
  return { ...template };
}

export function getAllowedRecoveryTemplatesForBusiness(
  businessKey: MetaWhatsappTemplateBusinessKey,
): RecoveryTemplateCatalogItem[] {
  return RECOVERY_TEMPLATE_CATALOG[businessKey]
    .filter((template) => template.enabled)
    .map(cloneTemplate);
}

export function isRecoveryTemplateAllowed(
  businessKey: MetaWhatsappTemplateBusinessKey,
  templateName: string,
) {
  const normalizedTemplateName = templateName.trim();

  if (!normalizedTemplateName) return false;

  return getAllowedRecoveryTemplatesForBusiness(businessKey).some(
    (template) => template.metaName === normalizedTemplateName,
  );
}