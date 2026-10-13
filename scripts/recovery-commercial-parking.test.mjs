import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/commercial-parking.ts";
const dataPath = "src/lib/dashboard/data.ts";
const chatRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const indicatorRoutePath = "src/app/api/recuperacion/carritos/chat-indicators/route.ts";
const sendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts";
const templateRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const templateSendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";

const helper = readFileSync(helperPath, "utf8");
const data = readFileSync(dataPath, "utf8");
const chatRoute = readFileSync(chatRoutePath, "utf8");
const indicatorRoute = readFileSync(indicatorRoutePath, "utf8");
const sendRoute = readFileSync(sendRoutePath, "utf8");
const templateRoute = readFileSync(templateRoutePath, "utf8");
const templateSendRoute = readFileSync(templateSendRoutePath, "utf8");

function loadHelperExports() {
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
    URL,
    exports: module.exports,
    module,
  });

  return module.exports;
}

const { recoveryCommercialHostname, resolveRecoveryCommercialParking } = loadHelperExports();

test("host EAP with original MPV resolves to EAP", () => {
  const result = resolveRecoveryCommercialParking({
    cmsUrl: "https://estacionamientoaeropuerto.cl/reserva/abc",
    parkingCode: "MPV",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.parkingCode, "EAP");
  assert.equal(result.reason, "cms_url_host");
});

test("host EAP with original EAP remains EAP", () => {
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://www.estacionamientoaeropuerto.cl", parkingCode: "EAP" }).parkingCode, "EAP");
});

test("website_source 2 identifies EAP even when original parking is MPV", () => {
  assert.equal(resolveRecoveryCommercialParking({ parkingCode: "MPV", websiteSource: 2 }).parkingCode, "EAP");
});

test("host MCP with original SCL1 resolves Marco to MPV", () => {
  const result = resolveRecoveryCommercialParking({
    cmsUrl: "https://www.mcparking.cl",
    parkingCode: "SCL1",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.parkingCode, "MPV");
});

test("host MCP with original MPV remains MPV", () => {
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://mcparking.cl", parkingCode: "MPV" }).parkingCode, "MPV");
});

test("unknown host falls back only to safe original MPV or EAP", () => {
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://otro.example", parkingCode: "EAP" }).parkingCode, "EAP");
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://otro.example", parkingCode: "SCL1" }).parkingCode, null);
});

test("similar domains are not accepted by includes-style matching", () => {
  assert.equal(recoveryCommercialHostname("https://fake-estacionamientoaeropuerto.cl"), "fake-estacionamientoaeropuerto.cl");
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://fake-estacionamientoaeropuerto.cl", parkingCode: "SCL1" }).parkingCode, null);
  assert.equal(resolveRecoveryCommercialParking({ cmsUrl: "https://mcparking.cl.evil.example", parkingCode: "SCL1" }).parkingCode, null);
});

test("reliable website and host contradictions fail closed", () => {
  const result = resolveRecoveryCommercialParking({
    cmsUrl: "https://mcparking.cl",
    parkingCode: "MPV",
    websiteSource: 2,
  });

  assert.equal(result.status, "conflict");
  assert.equal(result.parkingCode, null);
});

test("Marta business case resolves to EAP", () => {
  const result = resolveRecoveryCommercialParking({
    cmsUrl: "https://estacionamientoaeropuerto.cl",
    parkingCode: "MPV",
    websiteSource: 2,
  });

  assert.equal(result.parkingCode, "EAP");
});

test("server data layer preserves source data while publishing effective parking", () => {
  assert.match(data, /resolveRecoveryCommercialParking/);
  assert.match(data, /\.select\("id,message_id,parking_code,cms_url"\)/);
  assert.match(data, /parking_code:\s*commercialParking\.parkingCode/);
  assert.doesNotMatch(data, /\.update\(|\.insert\(|\.upsert\(/);
});

test("chat and indicator endpoints use cms_url before choosing the business phone", () => {
  assert.match(chatRoute, /resolveRecoveryCommercialParking/);
  assert.match(chatRoute, /cmsUrl:\s*cart\.cms_url/);
  assert.match(chatRoute, /parkingCode:\s*effectiveParking/);
  assert.match(chatRoute, /recoveryWhatsappBusinessPhoneForKey\(cartBusinessKey\)/);

  assert.match(indicatorRoute, /\.select\("id,booking_id,phone_normalized,parking_code,cms_url,form_datetime"\)/);
  assert.match(indicatorRoute, /resolveRecoveryCommercialParking/);
  assert.match(indicatorRoute, /cmsUrl:\s*cart\.cms_url/);
});

test("send and template routes compute sender from effective commercial parking", () => {
  assert.match(sendRoute, /\.select\("id,booking_id,email_normalized,phone_normalized,type,parking_code,cms_url"\)/);
  assert.match(sendRoute, /parking_code:\s*commercialParking\.parkingCode/);
  assert.match(sendRoute, /parking:\s*payload\.cart\.parking_code/);

  assert.match(templateRoute, /\.select\("id,booking_id,phone_normalized,parking_code,cms_url"\)/);
  assert.match(templateRoute, /parking_code:\s*commercialParking\.parkingCode/);

  assert.match(templateSendRoute, /\.select\("id,booking_id,phone_normalized,email_normalized,type,parking_code,cms_url"\)/);
  assert.match(templateSendRoute, /parking_code:\s*commercialParking\.parkingCode/);
});
