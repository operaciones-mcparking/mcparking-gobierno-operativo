import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const payloadPath = "src/lib/recuperacion/whatsapp-template-n8n-payload.ts";
const transportPath = "src/lib/recuperacion/whatsapp-template-n8n-transport.ts";

const route = readFileSync(routePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const payloadHelper = readFileSync(payloadPath, "utf8");
const transport = readFileSync(transportPath, "utf8");

function loadTransport({ env = {}, fetchImpl }) {
  const module = { exports: {} };
  const output = ts.transpileModule(transport, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: transportPath,
  }).outputText;

  vm.runInNewContext(output, {
    AbortController,
    Error,
    Response,
    clearTimeout,
    exports: module.exports,
    fetch: fetchImpl,
    module,
    process: { env },
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in transport test: ${name}`);
    },
    setTimeout,
  });

  return module.exports;
}

function templatePayload(senderKey = "MPV") {
  return {
    cartId: "cart-123",
    cartType: "abandoned_cart",
    metaPayload: {
      messaging_product: "whatsapp",
      template: {
        components: [
          {
            parameters: [
              { text: "uno", type: "text" },
              { text: "dos", type: "text" },
            ],
            type: "body",
          },
        ],
        language: { code: "es_CL" },
        name: senderKey === "MPV" ? "cp_generico" : "cp_generico_eap",
      },
      to: "56912345678",
      type: "template",
    },
    mode: "template",
    operatorEmail: "operador@mcparking.cl",
    previewText: "Hola uno dos",
    senderKey,
    sentAt: "2026-08-07T12:00:00.000Z",
    source: "recovery_web",
  };
}

function okResponse(senderKey = "MPV", overrides = {}) {
  return new Response(JSON.stringify({
    message: "Plantilla enviada por n8n",
    messageId: "wamid.template.123",
    messageStatus: "accepted",
    mode: "template",
    ok: true,
    senderKey,
    whatsappStatus: "sent",
    ...overrides,
  }), { status: 200 });
}

function env() {
  return {
    N8N_RECOVERY_WEBHOOK_SECRET: "secret-test",
    N8N_RECOVERY_WHATSAPP_WEBHOOK_URL: "https://n8n.test/webhook/recovery",
  };
}

async function sendWithFetch(fetchImpl, payload = templatePayload("MPV"), customEnv = env()) {
  const { sendRecoveryWhatsappTemplateViaN8n } = loadTransport({ env: customEnv, fetchImpl });
  return sendRecoveryWhatsappTemplateViaN8n(payload);
}

test("1. transport helper is server-only", () => {
  assert.match(transport, /^import "server-only";/);
});

test("2. MPV sends the exact internal contract to n8n", async () => {
  const calls = [];
  const payload = templatePayload("MPV");
  const result = await sendWithFetch(async (url, init) => {
    calls.push({ init, url });
    return okResponse("MPV");
  }, payload);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env().N8N_RECOVERY_WHATSAPP_WEBHOOK_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.headers["x-mcparking-recovery-secret"], env().N8N_RECOVERY_WEBHOOK_SECRET);
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
});

test("3. EAP sends the same contract with senderKey EAP", async () => {
  const calls = [];
  const payload = templatePayload("EAP");
  const result = await sendWithFetch(async (url, init) => {
    calls.push({ init, url });
    return okResponse("EAP");
  }, payload);

  assert.equal(result.ok, true);
  assert.equal(result.senderKey, "EAP");
  assert.equal(JSON.parse(calls[0].init.body).senderKey, "EAP");
  assert.equal(JSON.parse(calls[0].init.body).metaPayload.template.name, "cp_generico_eap");
});

test("4. successful response is normalized", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV"));
  assert.equal(JSON.stringify(result), JSON.stringify({
    message: "Plantilla enviada por n8n",
    messageId: "wamid.template.123",
    messageStatus: "accepted",
    ok: true,
    senderKey: "MPV",
    status: "sent",
  }));
});

test("5. route allows dryRun false after the same validation path", () => {
  assert.match(route, /typeof payload\.dryRun !== "boolean"/);
  assert.match(route, /if \(payload\.dryRun\) \{/);
  assert.match(route, /const n8nResult = await sendRecoveryWhatsappTemplateViaN8n\(n8nTransportPayload\)/);
  assert.ok(route.indexOf("validateBodyVariables") < route.indexOf("sendRecoveryWhatsappTemplateViaN8n(n8nTransportPayload)"));
});

test("6. route builds the n8n payload with the existing helper", () => {
  assert.match(route, /buildRecoveryWhatsappTemplateN8nPayload\(\{/);
  assert.match(route, /metaPayload,/);
  assert.match(route, /senderKey: businessKey/);
  assert.match(route, /operatorEmail: admin\.user\.email \?\? ""/);
});

test("7. dryRun false public response is minimal", () => {
  const responseBlock = route.slice(route.lastIndexOf("return NextResponse.json({"));
  assert.match(responseBlock, /dryRun: false/);
  assert.match(responseBlock, /send: \{/);
  assert.match(responseBlock, /messageId: n8nResult\.messageId/);
  assert.doesNotMatch(responseBlock, /metaPayload|n8nTransportPayload|operatorEmail|sentAt|phone_number_id|webhook|secret|token|WABA/i);
});

test("8. client cannot override server authority fields", () => {
  for (const field of ["senderKey", "businessKey", "metaPayload", "phone", "webhookUrl", "secreto", "templateName", "operatorEmail", "sentAt", "source", "phone_number_id", "accessToken"]) {
    assert.match(route, new RegExp(`"${field}"`));
  }
  assert.match(route, /unknown_payload_field/);
});

test("9. browser prepares with dryRun true and confirms with dryRun false only through the server endpoint", () => {
  const validateStart = drawer.indexOf("async function validateSelectedTemplate");
  const sendStart = drawer.indexOf("async function sendPreparedTemplate");
  const validateBlock = drawer.slice(validateStart, sendStart);
  const sendBlock = drawer.slice(sendStart, drawer.indexOf("return (", sendStart));

  assert.match(validateBlock, /dryRun: true/);
  assert.doesNotMatch(validateBlock, /dryRun: false|senderKey|metaPayload|webhookUrl|secreto|phone_number_id|accessToken/);
  assert.match(sendBlock, /dryRun: false/);
  assert.match(sendBlock, /\/chat\/send-template/);
  assert.doesNotMatch(sendBlock, /senderKey|metaPayload|webhookUrl|secreto|phone_number_id|accessToken|callN8nWebhook|N8N_RECOVERY/);
});

test("10. dryRun true branch returns before n8n call", () => {
  assert.ok(route.indexOf("if (payload.dryRun)") < route.indexOf("sendRecoveryWhatsappTemplateViaN8n(n8nTransportPayload)"));
});

test("11. missing webhook URL fails safely", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV"), templatePayload("MPV"), { N8N_RECOVERY_WEBHOOK_SECRET: "secret-test" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_configuration_error");
});

test("12. missing webhook secret fails safely", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV"), templatePayload("MPV"), { N8N_RECOVERY_WHATSAPP_WEBHOOK_URL: "https://n8n.test/webhook/recovery" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_configuration_error");
});

test("13. fetch network error is safe", async () => {
  const result = await sendWithFetch(async () => { throw new Error("network down"); });
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_network_error");
});

test("14. timeout is safe", async () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  const result = await sendWithFetch(async () => { throw abort; });
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_timeout");
});

test("15. HTTP errors are safe and do not expose response body", async () => {
  for (const status of [400, 401, 403, 500]) {
    const result = await sendWithFetch(async () => new Response(JSON.stringify({ secret: "raw body" }), { status }));
    assert.equal(result.ok, false);
    assert.equal(result.code, "n8n_http_error");
    assert.doesNotMatch(JSON.stringify(result), /raw body|secret-test|n8n\.test/);
    assert.equal(result.stage, "http");
  }
});

test("16. non JSON response is safe", async () => {
  const result = await sendWithFetch(async () => new Response("not-json", { status: 200 }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_invalid_json");
});

test("17. ok false is rejected", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV", { ok: false }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_rejected");
});

test("18. unexpected mode is rejected", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV", { mode: "freeform" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_invalid_mode");
});

test("19. unexpected senderKey is rejected", async () => {
  const result = await sendWithFetch(async () => okResponse("EAP"), templatePayload("MPV"));
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_sender_mismatch");
});

test("20. missing messageId is rejected", async () => {
  const result = await sendWithFetch(async () => okResponse("MPV", { messageId: "" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "n8n_missing_message_id");
});

test("21. dryRun false calls n8n exactly once with no retries", async () => {
  let calls = 0;
  const result = await sendWithFetch(async () => {
    calls += 1;
    return okResponse("MPV");
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.doesNotMatch(transport, /retry|for \(|while \(/i);
});

test("22. transport uses AbortController and timeout", () => {
  assert.match(transport, /new AbortController\(\)/);
  assert.match(transport, /setTimeout\(\(\) => controller\.abort\(\), RECOVERY_TEMPLATE_N8N_TIMEOUT_MS\)/);
  assert.match(transport, /signal: controller\.signal/);
  assert.match(transport, /clearTimeout\(timeout\)/);
  assert.match(transport, /Recovery template n8n transport failed/);
  assert.match(transport, /stage/);
  assert.match(transport, /n8nStatus/);
});

test("23. transport does not write Supabase or Google Sheets", () => {
  assert.doesNotMatch(transport + route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|spreadsheets|googleapis|Google Sheets/i);
});

test("24. transport does not call Graph messages directly", () => {
  assert.doesNotMatch(transport + route, /graph\.facebook\.com|\/messages|whatsappMessageId/);
});

test("25. route does not expose webhook URL or secret in public response", () => {
  const responseBlock = route.slice(route.lastIndexOf("return NextResponse.json({"));
  assert.doesNotMatch(responseBlock, /N8N_RECOVERY|webhookUrl|secret|secreto|x-mcparking-recovery-secret/i);
});

test("26. payload helper still defines the internal web to n8n contract", () => {
  for (const field of ["mode", "senderKey", "metaPayload", "previewText", "cartId", "cartType", "operatorEmail", "sentAt", "source"]) {
    assert.match(payloadHelper, new RegExp(`${field}:`));
  }
});