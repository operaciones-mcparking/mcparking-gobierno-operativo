import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const catalogPath = "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts";
const catalogSource = readFileSync(catalogPath, "utf8");

function loadCatalogExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(catalogSource, {
    compilerOptions: {
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: catalogPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in catalog test: ${name}`);
    },
  });

  return module.exports;
}

function template(name, label = "Meta Label") {
  return {
    category: "MARKETING",
    key: `${name}:es_CL`,
    label,
    language: "es_CL",
    name,
    preview: { body: "Body", buttons: [], footer: null, header: null },
    status: "APPROVED",
    variables: [],
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("1. catalog is server-only", () => {
  assert.match(catalogSource, /import "server-only"/);
});

test("2. MPV known template can receive presentation label", () => {
  const { decorateRecoveryTemplateForBusiness } = loadCatalogExports();
  const decorated = plain(decorateRecoveryTemplateForBusiness("MPV", template("cp_generico")));

  assert.equal(decorated.name, "cp_generico");
  assert.equal(decorated.label, "CP generico");
});

test("3. EAP known template can receive presentation label", () => {
  const { decorateRecoveryTemplateForBusiness } = loadCatalogExports();
  const decorated = plain(decorateRecoveryTemplateForBusiness("EAP", template("cp_generico_eap")));

  assert.equal(decorated.name, "cp_generico_eap");
  assert.equal(decorated.label, "CP generico EAP");
});

test("4. unknown approved templates are not filtered out", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const templates = plain(getAllowedRecoveryTemplatesForBusiness("MPV", [template("nuevo_meta"), template("cp_generico")]));

  assert.deepEqual(templates.map((item) => item.name), ["nuevo_meta", "cp_generico"]);
  assert.equal(isRecoveryTemplateAllowed("MPV", "nuevo_meta"), true);
  assert.equal(isRecoveryTemplateAllowed("EAP", "nuevo_meta"), true);
});

test("5. empty template names are rejected as invalid selection values", () => {
  const { isRecoveryTemplateAllowed } = loadCatalogExports();

  assert.equal(isRecoveryTemplateAllowed("MPV", ""), false);
  assert.equal(isRecoveryTemplateAllowed("EAP", "   "), false);
});

test("6. catalog does not expose secrets", () => {
  assert.doesNotMatch(catalogSource, /ACCESS_TOKEN|META_WHATSAPP_ACCESS_TOKEN|PHONE_NUMBER_ID|phone_number_id|NEXT_PUBLIC|Bearer/i);
});

test("7. catalog does not call Meta or n8n", () => {
  assert.doesNotMatch(catalogSource, /fetch\(|graph\.facebook\.com|message_templates|N8N_RECOVERY|n8n/i);
});

test("8. catalog does not write Supabase or send messages", () => {
  assert.doesNotMatch(catalogSource, /createClient|\.from\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(|method:\s*"POST"|\/chat\/send/);
});
