import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/meta-whatsapp-templates.ts";
const helper = readFileSync(helperPath, "utf8");

function loadHelperExports(fetchMock) {
  const module = { exports: {} };
  const env = {
    META_WHATSAPP_ACCESS_TOKEN: "secret-token-for-test",
    META_WHATSAPP_PHONE_NUMBER_ID_EAP: "1424055602018101",
    META_WHATSAPP_PHONE_NUMBER_ID_MPV: "784988524156610",
  };
  const output = ts.transpileModule(helper, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText;

  vm.runInNewContext(output, {
    Date,
    URL,
    exports: module.exports,
    fetch: fetchMock,
    module,
    process: { env },
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in Meta templates helper test: ${name}`);
    },
  });

  return module.exports;
}

function createFetchMock({ ok = true, payload = { data: [] }, status = 200 } = {}) {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ options, url: String(url) });

    return {
      ok,
      status,
      async json() {
        return payload;
      },
    };
  };

  fetchMock.calls = calls;

  return fetchMock;
}

test("1. helper is server-only and uses only private Meta env vars", () => {
  assert.match(helper, /import "server-only"/);
  assert.match(helper, /META_WHATSAPP_ACCESS_TOKEN/);
  assert.match(helper, /META_WHATSAPP_PHONE_NUMBER_ID_MPV/);
  assert.match(helper, /META_WHATSAPP_PHONE_NUMBER_ID_EAP/);
  assert.doesNotMatch(helper, /NEXT_PUBLIC/);
});

test("2. MPV uses its configured phone_number_id and private bearer token", async () => {
  const fetchMock = createFetchMock();
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  await fetchMetaWhatsappTemplatesForBusiness("MPV");

  assert.equal(fetchMock.calls.length, 1);
  assert.match(fetchMock.calls[0].url, /^https:\/\/graph\.facebook\.com\/v25\.0\/784988524156610\/message_templates\?/);
  assert.match(fetchMock.calls[0].url, /fields=name%2Clanguage%2Cstatus%2Ccategory/);
  assert.equal(fetchMock.calls[0].options.method, "GET");
  assert.equal(fetchMock.calls[0].options.headers.Authorization, "Bearer secret-token-for-test");
});

test("3. EAP uses its configured phone_number_id", async () => {
  const fetchMock = createFetchMock();
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  await fetchMetaWhatsappTemplatesForBusiness("EAP");

  assert.equal(fetchMock.calls.length, 1);
  assert.match(fetchMock.calls[0].url, /^https:\/\/graph\.facebook\.com\/v25\.0\/1424055602018101\/message_templates\?/);
});

test("4. DTO exposes only approved safe template fields", async () => {
  const fetchMock = createFetchMock({
    payload: {
      data: [
        { category: "MARKETING", components: [{ text: "raw" }], id: "meta-id-1", language: "es_CL", name: "recuperacion_cliente", status: "APPROVED" },
        { category: "UTILITY", language: "es", name: "pausada", status: "PAUSED" },
        { category: "MARKETING", language: "es", name: "deshabilitada", status: "DISABLED" },
        { category: "MARKETING", language: "es", name: "rara", status: "SOMETHING" },
      ],
    },
  });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  const templates = await fetchMetaWhatsappTemplatesForBusiness("MPV");

  assert.deepEqual(JSON.parse(JSON.stringify(templates)), [
    {
      category: "MARKETING",
      label: "Recuperacion Cliente",
      language: "es_CL",
      name: "recuperacion_cliente",
      status: "APPROVED",
    },
  ]);
  assert.equal(JSON.stringify(templates).includes("secret-token-for-test"), false);
  assert.equal(JSON.stringify(templates).includes("784988524156610"), false);
  assert.equal(JSON.stringify(templates).includes("components"), false);
  assert.equal(JSON.stringify(templates).includes("meta-id-1"), false);
});

test("5. Meta errors are sanitized", async () => {
  const fetchMock = createFetchMock({ ok: false, payload: { error: { message: "token leaked?" } }, status: 500 });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  await assert.rejects(
    () => fetchMetaWhatsappTemplatesForBusiness("MPV"),
    (error) => {
      assert.equal(error.message, "No se pudieron cargar templates de WhatsApp.");
      assert.equal(error.message.includes("secret-token-for-test"), false);
      assert.equal(error.message.includes("784988524156610"), false);
      return true;
    },
  );
});

test("6. cache avoids repeated Meta calls inside the TTL", async () => {
  const fetchMock = createFetchMock({
    payload: {
      data: [{ category: "MARKETING", language: "es_CL", name: "recuperacion_cliente", status: "APPROVED" }],
    },
  });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  const first = await fetchMetaWhatsappTemplatesForBusiness("MPV");
  const second = await fetchMetaWhatsappTemplatesForBusiness("MPV");

  assert.equal(fetchMock.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
});

test("7. helper does not call n8n or send WhatsApp messages", () => {
  assert.doesNotMatch(helper, /N8N_RECOVERY|n8n|\/chat\/send|send-template/);
  assert.doesNotMatch(helper, /method:\s*"POST"|\.insert\(|\.update\(|recovery_whatsapp_live_messages/);
});