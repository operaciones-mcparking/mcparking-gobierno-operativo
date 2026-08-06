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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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
  assert.match(fetchMock.calls[0].url, /fields=name%2Clanguage%2Cstatus%2Ccategory%2Ccomponents/);
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

test("4. DTO exposes all approved safe template previews", async () => {
  const fetchMock = createFetchMock({
    payload: {
      data: [
        {
          category: "MARKETING",
          components: [
            { text: "Hola {{1}}", type: "HEADER" },
            { text: "Tu reserva {{2}} sigue pendiente.", type: "BODY" },
            { text: "Equipo McParking", type: "FOOTER" },
            { buttons: [{ text: "Ver reserva", type: "URL" }], type: "BUTTONS" },
          ],
          id: "meta-id-1",
          language: "es_CL",
          name: "recuperacion_cliente",
          status: "APPROVED",
        },
        { category: "UTILITY", components: [{ text: "Body utility", type: "BODY" }], language: "es", name: "utilidad_cliente", status: "APPROVED" },
        { category: "UTILITY", language: "es", name: "pausada", status: "PAUSED" },
        { category: "MARKETING", language: "es", name: "deshabilitada", status: "DISABLED" },
      ],
    },
  });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  const templates = plain(await fetchMetaWhatsappTemplatesForBusiness("MPV"));

  assert.equal(templates.length, 2);
  assert.deepEqual(templates.map((template) => template.name).sort(), ["recuperacion_cliente", "utilidad_cliente"]);
  const marketing = templates.find((template) => template.name === "recuperacion_cliente");
  assert.deepEqual(marketing.preview, {
    body: "Tu reserva {{2}} sigue pendiente.",
    buttons: [{ text: "Ver reserva", type: "URL" }],
    footer: "Equipo McParking",
    header: "Hola {{1}}",
  });
  assert.deepEqual(marketing.variables, [
    { placeholder: "{{1}}", position: 1 },
    { placeholder: "{{2}}", position: 2 },
  ]);
  assert.equal(JSON.stringify(templates).includes("secret-token-for-test"), false);
  assert.equal(JSON.stringify(templates).includes("784988524156610"), false);
  assert.equal(JSON.stringify(templates).includes("components"), false);
  assert.equal(JSON.stringify(templates).includes("meta-id-1"), false);
});

test("5. templates without body keep a safe unavailable preview", async () => {
  const fetchMock = createFetchMock({
    payload: { data: [{ category: "MARKETING", components: [], language: "es_CL", name: "sin_body", status: "APPROVED" }] },
  });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  const [template] = plain(await fetchMetaWhatsappTemplatesForBusiness("MPV"));

  assert.equal(template.preview.body, null);
  assert.equal(template.preview.header, null);
  assert.deepEqual(template.preview.buttons, []);
});

test("6. Meta errors are sanitized", async () => {
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

test("7. cache avoids repeated Meta calls inside the TTL", async () => {
  const fetchMock = createFetchMock({
    payload: { data: [{ category: "MARKETING", components: [{ text: "Body", type: "BODY" }], language: "es_CL", name: "recuperacion_cliente", status: "APPROVED" }] },
  });
  const { clearMetaWhatsappTemplatesCache, fetchMetaWhatsappTemplatesForBusiness } = loadHelperExports(fetchMock);

  clearMetaWhatsappTemplatesCache();
  const first = await fetchMetaWhatsappTemplatesForBusiness("MPV");
  const second = await fetchMetaWhatsappTemplatesForBusiness("MPV");

  assert.equal(fetchMock.calls.length, 1);
  assert.deepEqual(plain(second), plain(first));
});

test("8. helper does not call n8n or send WhatsApp messages", () => {
  assert.doesNotMatch(helper, /N8N_RECOVERY|n8n|\/chat\/send|send-template/);
  assert.doesNotMatch(helper, /method:\s*"POST"|\.insert\(|\.update\(|recovery_whatsapp_live_messages/);
});
