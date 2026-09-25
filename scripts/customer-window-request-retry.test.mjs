import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/customer-window/customer-request-retry.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const retry = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

test("retries one transient 5xx and then succeeds", async () => {
  const responses = [jsonResponse(500, { error: "transient" }), jsonResponse(200, { ok: true })];
  const delays = [];
  const result = await retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => responses.shift(),
    retryDelaysMs: [1_000, 2_000],
    sleep: async (delay) => delays.push(delay),
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(delays, [1_000]);
});

test("retries two transient failures and succeeds on the third attempt", async () => {
  let calls = 0;
  const result = await retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse(calls < 3 ? 503 : 200, calls < 3 ? { error: "transient" } : { ok: true });
    },
    retryDelaysMs: [1_000, 2_000],
    sleep: async () => {},
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { ok: true });
});

test("surfaces the error after retries are exhausted", async () => {
  let calls = 0;
  await assert.rejects(() => retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse(500, { error: "No fue posible consultar representaciones por periodo." });
    },
    retryDelaysMs: [1, 2],
    sleep: async () => {},
  }), /No fue posible consultar representaciones/);
  assert.equal(calls, 3);
});

test("does not retry contractual 400 responses", async () => {
  let calls = 0;
  await assert.rejects(() => retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse(400, { error: "Parámetros inválidos." });
    },
    sleep: async () => {},
  }), /Parámetros inválidos/);
  assert.equal(calls, 1);
});

test("does not retry a server-side contract failure explicitly marked non-retryable", async () => {
  let calls = 0;
  await assert.rejects(() => retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse(500, { error: "Contrato inválido.", retryable: false });
    },
    sleep: async () => {},
  }), /Contrato inválido/);
  assert.equal(calls, 1);
});

test("does not retry an invalid successful response contract", async () => {
  let calls = 0;
  await assert.rejects(() => retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      return new Response("not-json", { status: 200 });
    },
    sleep: async () => {},
  }), { name: "CustomerWindowResponseError" });
  assert.equal(calls, 1);
});

test("retries network TypeError without exposing its contents", async () => {
  let calls = 0;
  const result = await retry.getCustomerWindowJsonWithRetry("/test", undefined, {
    fetcher: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("simulated secret");
      return jsonResponse(200, { ok: true });
    },
    retryDelaysMs: [1, 2],
    sleep: async () => {},
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true });
});
