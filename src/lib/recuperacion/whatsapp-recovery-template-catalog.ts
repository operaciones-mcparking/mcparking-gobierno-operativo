import "server-only";

import type { MetaWhatsappTemplateBusinessKey, SafeMetaWhatsappTemplate } from "./meta-whatsapp-templates";

export type RecoveryTemplateCatalogItem = {
  description: string;
  enabled: boolean;
  key: string;
  label: string;
  language: string;
  metaName: string;
};

export const RECOVERY_TEMPLATE_PRESENTATION: Partial<
  Record<MetaWhatsappTemplateBusinessKey, Record<string, Pick<RecoveryTemplateCatalogItem, "description" | "label">>>
> = {
  EAP: {
    cp_generico_eap: {
      description: "Plantilla generica aprobada para recuperacion EAP.",
      label: "CP generico EAP",
    },
  },
  MPV: {
    cp_generico: {
      description: "Plantilla generica aprobada para recuperacion MPV.",
      label: "CP generico",
    },
  },
};

export function decorateRecoveryTemplateForBusiness(
  businessKey: MetaWhatsappTemplateBusinessKey,
  template: SafeMetaWhatsappTemplate,
): SafeMetaWhatsappTemplate {
  const presentation = RECOVERY_TEMPLATE_PRESENTATION[businessKey]?.[template.name];

  return {
    ...template,
    label: presentation?.label ?? template.label,
  };
}

export function getAllowedRecoveryTemplatesForBusiness(
  _businessKey: MetaWhatsappTemplateBusinessKey,
  templates: SafeMetaWhatsappTemplate[] = [],
): SafeMetaWhatsappTemplate[] {
  return templates.map((template) => ({ ...template }));
}

export function isRecoveryTemplateAllowed(
  _businessKey: MetaWhatsappTemplateBusinessKey,
  templateName: string,
) {
  return templateName.trim().length > 0;
}
