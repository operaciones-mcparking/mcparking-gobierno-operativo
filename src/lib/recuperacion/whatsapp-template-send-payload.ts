import "server-only";

export type MetaTemplateTextParameter = {
  text: string;
  type: "text";
};

export type MetaTemplateBodyComponent = {
  parameters: MetaTemplateTextParameter[];
  type: "body";
};

export type MetaTemplateMessagePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    components?: MetaTemplateBodyComponent[];
    language: {
      code: string;
    };
    name: string;
  };
};

export type RecoveryWhatsappTemplateVariableValue = {
  position: number;
  text: string;
};

export type BuildRecoveryWhatsappMetaTemplatePayloadInput = {
  language: string;
  templateName: string;
  to: string;
  variables: RecoveryWhatsappTemplateVariableValue[];
};

export function buildRecoveryWhatsappMetaTemplatePayload({
  language,
  templateName,
  to,
  variables,
}: BuildRecoveryWhatsappMetaTemplatePayloadInput): MetaTemplateMessagePayload {
  const orderedVariables = [...variables].sort((left, right) => left.position - right.position);
  const payload: MetaTemplateMessagePayload = {
    messaging_product: "whatsapp",
    template: {
      language: {
        code: language,
      },
      name: templateName,
    },
    to,
    type: "template",
  };

  if (orderedVariables.length > 0) {
    payload.template.components = [
      {
        parameters: orderedVariables.map((variable) => ({
          text: variable.text,
          type: "text",
        })),
        type: "body",
      },
    ];
  }

  return payload;
}

export function buildRecoveryWhatsappMetaTemplatePayloadPreview(
  payload: MetaTemplateMessagePayload,
  maskedTo: string | null,
): MetaTemplateMessagePayload {
  return {
    ...payload,
    template: {
      ...payload.template,
      components: payload.template.components,
      language: {
        ...payload.template.language,
      },
    },
    to: maskedTo ?? "masked",
  };
}