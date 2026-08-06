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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("1. catalog is server-only", () => {
  assert.match(catalogSource, /import "server-only"/);
});

test("2. MPV returns cp_generico", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const templates = plain(getAllowedRecoveryTemplatesForBusiness("MPV"));

  assert.deepEqual(templates.map((template) => template.metaName), ["cp_generico"]);
  assert.equal(isRecoveryTemplateAllowed("MPV", "cp_generico"), true);
});

test("3. EAP returns cp_generico_eap", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const templates = plain(getAllowedRecoveryTemplatesForBusiness("EAP"));

  assert.deepEqual(templates.map((template) => template.metaName), ["cp_generico_eap"]);
  assert.equal(isRecoveryTemplateAllowed("EAP", "cp_generico_eap"), true);
});

test("4. MPV does not return EAP templates", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const names = plain(getAllowedRecoveryTemplatesForBusiness("MPV")).map((template) => template.metaName);

  assert.equal(names.includes("cp_generico_eap"), false);
  assert.equal(isRecoveryTemplateAllowed("MPV", "cp_generico_eap"), false);
});

test("5. EAP does not return MPV templates", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const names = plain(getAllowedRecoveryTemplatesForBusiness("EAP")).map((template) => template.metaName);

  assert.equal(names.includes("cp_generico"), false);
  assert.equal(isRecoveryTemplateAllowed("EAP", "cp_generico"), false);
});

test("6. disabled templates do not appear", () => {
  const { RECOVERY_TEMPLATE_CATALOG, getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();

  RECOVERY_TEMPLATE_CATALOG.MPV[0].enabled = false;

  assert.deepEqual(plain(getAllowedRecoveryTemplatesForBusiness("MPV")), []);
  assert.equal(isRecoveryTemplateAllowed("MPV", "cp_generico"), false);
});

test("7. unknown templates are rejected", () => {
  const { isRecoveryTemplateAllowed } = loadCatalogExports();

  assert.equal(isRecoveryTemplateAllowed("MPV", ""), false);
  assert.equal(isRecoveryTemplateAllowed("MPV", "no_existe"), false);
  assert.equal(isRecoveryTemplateAllowed("EAP", "no_existe"), false);
});

test("8. catalog does not expose secrets", () => {
  assert.doesNotMatch(catalogSource, /ACCESS_TOKEN|META_WHATSAPP_ACCESS_TOKEN|PHONE_NUMBER_ID|phone_number_id|NEXT_PUBLIC|Bearer/i);
});

test("9. catalog does not call Meta or n8n", () => {
  assert.doesNotMatch(catalogSource, /fetch\(|graph\.facebook\.com|message_templates|N8N_RECOVERY|n8n/i);
});

test("10. catalog does not write Supabase or send messages", () => {
  assert.doesNotMatch(catalogSource, /createClient|\.from\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(|method:\s*"POST"|\/chat\/send/);
});