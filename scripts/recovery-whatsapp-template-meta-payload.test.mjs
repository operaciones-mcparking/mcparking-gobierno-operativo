import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/whatsapp-template-send-payload.ts";
const routePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";

const helper = readFileSync(helperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");

function loadPayloadHelper() {
  const module = { exports: {} };
  const output = ts.transpileModule(helper, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in payload helper test: ${name}`);
    },
  });

  return module.exports;
}

function validateFunctionBlock() {
  const start = drawer.indexOf("async function validateSelectedTemplate");
  const end = drawer.indexOf("async function sendPreparedTemplate", start);

  return drawer.slice(start, end);
}

function sendFunctionBlock() {
  const start = drawer.indexOf("async function sendPreparedTemplate");
  const end = drawer.indexOf("return (", start);

  return drawer.slice(start, end);
}

test("1. builds messaging_product whatsapp", () => {
  assert.match(helper, /messaging_product: "whatsapp"/);
});

test("2. builds template message type", () => {
  assert.match(helper, /type: "template"/);
});

test("3. uses server-side validated phone", () => {
  assert.match(route, /to: cartResult\.cart\.phone_normalized/);
  assert.doesNotMatch(validateFunctionBlock(), /phone\s*:|phone_number_id|to\s*:/);
});

test("4. uses validated Meta template name", () => {
  assert.match(route, /templateName: template\.name/);
  assert.doesNotMatch(validateFunctionBlock(), /templateName/);
});

test("5. uses validated Meta language", () => {
  assert.match(route, /language: template\.language/);
  assert.match(helper, /code: language/);
});

test("6. orders BODY parameters", () => {
  assert.match(helper, /sort\(\(left, right\) => left\.position - right\.position\)/);
});

test("7. transforms variables to text parameters", () => {
  assert.match(helper, /parameters: bodyVariables\.map/);
  assert.match(helper, /type: "text"/);
  assert.match(helper, /text: variable\.text/);
});

test("8. omits components only when there are no variables or required media header", () => {
  assert.match(helper, /if \(components\.length > 0\)/);
  assert.doesNotMatch(helper, /components: \[\]/);
});

test("8b. builds approved media HEADER components from Meta template metadata", () => {
  assert.match(helper, /headerMedia\?: RecoveryWhatsappTemplateHeaderMedia \| null/);
  assert.match(helper, /function mediaHeaderParameter/);
  assert.match(helper, /type: "header"/);
  assert.match(helper, /parameters: \[mediaHeaderParameter\(headerMedia\)\]/);
  assert.match(route, /headerMedia: template\.preview\.headerMedia\?\.link/);
  assert.match(route, /unsupported_template_components/);
});

test("9. helper does not include token", () => {
  assert.doesNotMatch(helper + route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|access_token/);
});

test("10. helper does not include phone_number_id", () => {
  assert.doesNotMatch(helper, /phone_number_id|META_WHATSAPP_PHONE_NUMBER_ID/);
  assert.doesNotMatch(route, /META_WHATSAPP_PHONE_NUMBER_ID|payload\.phone_number_id|phone_number_id\?: unknown/);
  assert.match(route, /"phone_number_id"/);
});

test("11. helper does not include WABA", () => {
  assert.doesNotMatch(helper + route, /WABA|waba/i);
});

test("12. route does not accept graph payload from the client", () => {
  assert.match(route, /ALLOWED_DRY_RUN_PAYLOAD_KEYS = new Set\(\["dryRun", "language", "templateKey", "variables"\]\)/);
  assert.doesNotMatch(route, /graphPayload\?: unknown|payload\.graphPayload/);
});

test("13. route does not accept businessKey from the client", () => {
  assert.doesNotMatch(route, /businessKey\?: unknown|payload\.businessKey/);
  assert.match(route, /const businessKey = windowState\.businessKey/);
});

test("14. route does not accept phone from the client", () => {
  assert.doesNotMatch(route, /phone\?: unknown|payload\.phone/);
  assert.match(route, /cartResult\.cart\.phone_normalized/);
});

test("15. public Meta payload preview masks phone", () => {
  assert.match(route, /buildRecoveryWhatsappMetaTemplatePayloadPreview\(metaPayload, maskPhone\(cartResult\.cart\.phone_normalized\)\)/);
  assert.match(helper, /to: maskedTo \?\? "masked"/);
});

test("16. internal payload keeps full phone for future server-side integration", () => {
  assert.match(helper, /to,/);
  assert.match(route, /const metaPayload = buildRecoveryWhatsappMetaTemplatePayload/);
  assert.match(route, /to: cartResult\.cart\.phone_normalized/);
});

test("17. payload helper does not fetch", () => {
  assert.doesNotMatch(helper, /fetch\(/);
});

test("18. payload helper and dry-run route do not expose n8n config", () => {
  assert.doesNotMatch(helper + route, /N8N_RECOVERY|callN8nWebhook|x-mcparking-recovery-secret/);
  assert.match(route, /"webhookUrl"/);
});

test("19. payload helper does not write Supabase", () => {
  assert.doesNotMatch(helper, /supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i);
});

test("20. route still does not send Meta messages", () => {
  assert.doesNotMatch(helper + route, /graph\.facebook\.com[\s\S]*\/messages|\/messages[\s\S]*fetch\(/);
});

test("21. UI preparation continues using dryRun true", () => {
  assert.match(validateFunctionBlock(), /dryRun: true/);
  assert.doesNotMatch(validateFunctionBlock(), /dryRun: false/);
});

test("22. one template action exposes preparation and explicit confirmation states", () => {
  assert.match(drawer, /Preparar envío/);
  assert.match(drawer, /Preparando\.\.\./);
  assert.match(drawer, /Confirmar y enviar/);
  assert.match(drawer, /isTemplatePrepared \? sendPreparedTemplate\(\) : validateSelectedTemplate\(\)/);
});

test("23. confirmation does not call Graph messages or n8n directly from the UI", () => {
  assert.match(sendFunctionBlock(), /dryRun: false/);
  assert.doesNotMatch(sendFunctionBlock(), /callN8nWebhook|N8N_RECOVERY|graph\.facebook\.com|\/messages|phone_number_id|accessToken|metaPayload/);
});

test("24. utilizar_tarjeta media header contract sends approved IMAGE header with no body variables", () => {
  const { buildRecoveryWhatsappMetaTemplatePayload } = loadPayloadHelper();
  const payload = buildRecoveryWhatsappMetaTemplatePayload({
    headerMedia: {
      format: "IMAGE",
      link: "https://scontent.whatsapp.net/template-header.png",
    },
    language: "es_CL",
    templateName: "utilizar_tarjeta",
    to: "56997068669",
    variables: [],
  });

  assert.equal(JSON.stringify(payload.template.components), JSON.stringify([
    {
      parameters: [
        {
          image: { link: "https://scontent.whatsapp.net/template-header.png" },
          type: "image",
        },
      ],
      type: "header",
    },
  ]));
});

test("25. acceso_parking_diario sends header first and body variables in approved order", () => {
  const { buildRecoveryWhatsappMetaTemplatePayload } = loadPayloadHelper();
  const payload = buildRecoveryWhatsappMetaTemplatePayload({
    headerMedia: {
      format: "IMAGE",
      link: "https://scontent.whatsapp.net/access-header.jpg",
    },
    language: "es_CL",
    templateName: "acceso_parking_diario",
    to: "56997068669",
    variables: [
      { position: 3, text: "13-10-2026 13:00" },
      { position: 1, text: "MPV123456" },
      { position: 2, text: "13-10-2026 10:00" },
    ],
  });

  assert.equal(JSON.stringify(payload.template.components), JSON.stringify([
    {
      parameters: [
        {
          image: { link: "https://scontent.whatsapp.net/access-header.jpg" },
          type: "image",
        },
      ],
      type: "header",
    },
    {
      parameters: [
        { text: "MPV123456", type: "text" },
        { text: "13-10-2026 10:00", type: "text" },
        { text: "13-10-2026 13:00", type: "text" },
      ],
      type: "body",
    },
  ]));
});

test("26. named body parameters preserve parameter_name for Meta", () => {
  const { buildRecoveryWhatsappMetaTemplatePayload } = loadPayloadHelper();
  const payload = buildRecoveryWhatsappMetaTemplatePayload({
    language: "es_CL",
    templateName: "mcp_to_okp",
    to: "56997068669",
    variables: [
      { component: "BODY", parameterName: "correo", position: 3, text: "cliente@example.com" },
      { component: "BODY", parameterName: "dias", position: 1, text: "7" },
      { component: "BODY", parameterName: "fecha_expiracion", position: 2, text: "31/12/2026" },
    ],
  });

  assert.equal(JSON.stringify(payload.template.components), JSON.stringify([
    {
      parameters: [
        { parameter_name: "dias", text: "7", type: "text" },
        { parameter_name: "fecha_expiracion", text: "31/12/2026", type: "text" },
        { parameter_name: "correo", text: "cliente@example.com", type: "text" },
      ],
      type: "body",
    },
  ]));
});

test("27. header text variables are emitted as header components", () => {
  const { buildRecoveryWhatsappMetaTemplatePayload } = loadPayloadHelper();
  const payload = buildRecoveryWhatsappMetaTemplatePayload({
    language: "es_CL",
    templateName: "header_text_example",
    to: "56997068669",
    variables: [
      { component: "HEADER", parameterName: null, position: 1, text: "McParking" },
      { component: "BODY", parameterName: null, position: 1, text: "Reserva 123" },
    ],
  });

  assert.equal(JSON.stringify(payload.template.components), JSON.stringify([
    {
      parameters: [
        { text: "McParking", type: "text" },
      ],
      type: "header",
    },
    {
      parameters: [
        { text: "Reserva 123", type: "text" },
      ],
      type: "body",
    },
  ]));
});
