import "server-only";

export type MetaTemplateTextParameter = {
  parameter_name?: string;
  text: string;
  type: "text";
};

export type MetaTemplateMediaHeaderParameter =
  | {
      image: {
        id?: string;
        link?: string;
      };
      type: "image";
    }
  | {
      document: {
        id?: string;
        link?: string;
      };
      type: "document";
    }
  | {
      type: "video";
      video: {
        id?: string;
        link?: string;
      };
    };

export type MetaTemplateHeaderComponent = {
  parameters: [MetaTemplateMediaHeaderParameter] | MetaTemplateTextParameter[];
  type: "header";
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
    components?: Array<MetaTemplateBodyComponent | MetaTemplateHeaderComponent>;
    language: {
      code: string;
    };
    name: string;
  };
};

export type RecoveryWhatsappTemplateHeaderMedia = {
  format: "DOCUMENT" | "IMAGE" | "VIDEO";
  id?: string | null;
  link?: string | null;
};

export type RecoveryWhatsappTemplateVariableValue = {
  component?: "BODY" | "HEADER";
  parameterName?: string | null;
  position: number;
  text: string;
};

export type BuildRecoveryWhatsappMetaTemplatePayloadInput = {
  headerMedia?: RecoveryWhatsappTemplateHeaderMedia | null;
  language: string;
  templateName: string;
  to: string;
  variables: RecoveryWhatsappTemplateVariableValue[];
};

function mediaHeaderParameter(media: RecoveryWhatsappTemplateHeaderMedia): MetaTemplateMediaHeaderParameter {
  const reference = media.id ? { id: media.id } : { link: media.link ?? "" };

  if (media.format === "DOCUMENT") {
    return { document: reference, type: "document" };
  }

  if (media.format === "VIDEO") {
    return { type: "video", video: reference };
  }

  return { image: reference, type: "image" };
}

export function buildRecoveryWhatsappMetaTemplatePayload({
  headerMedia,
  language,
  templateName,
  to,
  variables,
}: BuildRecoveryWhatsappMetaTemplatePayloadInput): MetaTemplateMessagePayload {
  const orderedVariables = [...variables].sort((left, right) => left.position - right.position);
  const headerVariables = orderedVariables.filter((variable) => variable.component === "HEADER");
  const bodyVariables = orderedVariables.filter((variable) => !variable.component || variable.component === "BODY");
  const components: Array<MetaTemplateBodyComponent | MetaTemplateHeaderComponent> = [];
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

  if (headerMedia) {
    components.push({
      parameters: [mediaHeaderParameter(headerMedia)],
      type: "header",
    });
  } else if (headerVariables.length > 0) {
    components.push({
      parameters: headerVariables.map((variable) => ({
        ...(variable.parameterName ? { parameter_name: variable.parameterName } : {}),
        text: variable.text,
        type: "text",
      })),
      type: "header",
    });
  }

  if (bodyVariables.length > 0) {
    components.push({
      parameters: bodyVariables.map((variable) => ({
        ...(variable.parameterName ? { parameter_name: variable.parameterName } : {}),
        text: variable.text,
        type: "text",
      })),
      type: "body",
    });
  }

  if (components.length > 0) {
    payload.template.components = components;
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
