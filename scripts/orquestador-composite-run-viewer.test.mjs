import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

import { compositeKind, compositeRunId, fixtures } from "./fixtures/composite-run-viewer-fixtures.mjs";

const mapperPath = "src/lib/orquestador/composite-runs.ts";
const viewerPath = "src/app/orquestador/composite-run-viewer.tsx";
const typesPath = "src/lib/orquestador/types.ts";

const mapperSource = readFileSync(mapperPath, "utf8");
const viewerSource = readFileSync(viewerPath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function loadMapper() {
  const source = mapperSource.replace(
    /import \{ sanitizeOperationalText \} from "@\/lib\/orquestador\/types";/,
    `function sanitizeOperationalText(value) {
      if (!value) return null;
      const normalized = value.replace(/\\s+/g, " ").trim();
      if (!normalized || /\\b[A-Z]:\\\\[^\\s]+/i.test(normalized) || /\\bat\\s+.+\\(.+\\)|Traceback \\(most recent call last\\):|^\\s*at\\s+/m.test(normalized) || (normalized.startsWith("{") && normalized.endsWith("}")) || (normalized.startsWith("[") && normalized.endsWith("]"))) {
        return "Error operacional registrado.";
      }
      return normalized.length > 160 ? normalized.slice(0, 157).trimEnd() + "..." : normalized;
    }`,
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(compiled, { exports: module.exports, module }, { filename: mapperPath });
  return module.exports;
}

const mapper = loadMapper();

function map(rows, options = {}) {
  return mapper.mapCompositeRunJobs(rows, {
    kind: compositeKind,
    runId: compositeRunId,
    totalSteps: 3,
    ...options,
  });
}

function progress(run) {
  return `${run.steps.filter((step) => step.status === "succeeded").length}/${run.total_steps}`;
}

test("A. componente existe", () => {
  assert.equal(existsSync(viewerPath), true);
  assert.match(viewerSource, /export function CompositeRunViewer/);
});

test("B. tipos existen", () => {
  assert.match(mapperSource, /export type CompositeRunStatus/);
  assert.match(mapperSource, /export type CompositeRunStepStatus/);
  assert.match(mapperSource, /export type CompositeRunStepViewModel/);
  assert.match(mapperSource, /export type CompositeRunViewModel/);
});

test("C. no contiene payload result crudo", () => {
  assert.doesNotMatch(mapperSource, /\bpayload\b|row\.result|result:\s*row|metadata/);
  assert.doesNotMatch(viewerSource, /\bpayload\b|row\.result|result:\s*row|metadata/);
});

test("D. ordena por sequence_index", () => {
  assert.equal(JSON.stringify(map(fixtures.outOfOrder).steps.map((step) => step.step)), JSON.stringify([1, 2, 3]));
});

test("E. detecta total_steps", () => {
  assert.equal(map(fixtures.step1Running).total_steps, 3);
});

test("F. mapea labels conocidas", () => {
  assert.equal(JSON.stringify(map(fixtures.step3Running).steps.map((step) => step.label)), JSON.stringify([
    "Actualizar Reservas ultimo mes",
    "Actualizar Banco de Packs",
    "Actualizar Ocupaciones ultima semana",
  ]));
});

test("G. paso faltante genera placeholder", () => {
  const run = map(fixtures.missingRow);
  assert.equal(run.steps[1].status, "pending");
  assert.equal(run.steps[1].job_id, null);
});

test("H. estado running correcto", () => {
  assert.equal(map(fixtures.step1Running).status, "running");
});

test("I. estado succeeded correcto", () => {
  assert.equal(map(fixtures.succeeded).status, "succeeded");
});

test("J. estado failed correcto", () => {
  assert.equal(map(fixtures.failedStep2).status, "failed");
});

test("K. estado cancelled correcto", () => {
  assert.equal(map(fixtures.cancelled).status, "cancelled");
});

test("L. pasos posteriores a fallo quedan blocked", () => {
  const run = map(fixtures.failedStep2);
  assert.equal(run.steps[2].status, "blocked");
});

test("M. current_step correcto", () => {
  assert.equal(map(fixtures.step2Running).current_step, 2);
  assert.equal(map(fixtures.failedStep1).current_step, 1);
});

test("N. progreso 1/3 2/3 3/3", () => {
  assert.equal(progress(map(fixtures.step2Running)), "1/3");
  assert.equal(progress(map(fixtures.step3Running)), "2/3");
  assert.equal(progress(map(fixtures.succeeded)), "3/3");
});

test("O. duracion calculada", () => {
  assert.equal(map(fixtures.succeeded).steps[0].duration_seconds, 60);
  assert.equal(map(fixtures.succeeded).duration_seconds, 300);
});

test("P. job ID resumido", () => {
  assert.equal(mapper.shortCompositeJobId("12345678-aaaa-bbbb"), "12345678");
  assert.equal(mapper.shortCompositeJobId(null), "-");
});

test("Q. mensajes sanitizados", () => {
  const run = map([
    {
      ...fixtures.step1Running[0],
      requested_source: "mensaje seguro\nsin salto",
    },
  ]);
  assert.equal(run.steps[0].safe_message, "mensaje seguro sin salto");
});

test("R. errores sanitizados", () => {
  assert.equal(map(fixtures.failedStep1).steps[0].safe_error, "Error operacional registrado.");
  assert.equal(map(fixtures.failedStep2).steps[1].safe_error, "Error operacional registrado.");
});

test("S. no expone stdout", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /stdout/);
});

test("T. no expone stderr", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /stderr/);
});

test("U. no expone command_preview", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /command_preview/);
});

test("V. usa aria-live", () => {
  assert.match(viewerSource, /aria-live="polite"/);
});

test("W. progreso tiene ARIA", () => {
  assert.match(viewerSource, /role="progressbar"/);
  assert.match(viewerSource, /aria-valuenow/);
  assert.match(viewerSource, /aria-valuemin/);
  assert.match(viewerSource, /aria-valuemax/);
});

test("X. no depende solo del color", () => {
  assert.match(viewerSource, /statusLabels/);
  assert.match(viewerSource, /runStatusLabels/);
  assert.match(viewerSource, /StepIcon/);
});

test("Y. callback retry es opcional", () => {
  assert.match(viewerSource, /onRetry\?: \(\) => void/);
  assert.match(viewerSource, /onRetry \?/);
});

test("Y1. filas compactas alinean titulo estado y duracion", () => {
  assert.match(viewerSource, /divide-y divide-\[#d6e1ea\]/);
  assert.match(viewerSource, /sm:grid-cols-\[minmax\(14rem,1fr\)_9rem_5rem\]/);
  assert.match(viewerSource, /whitespace-nowrap/);
  assert.match(viewerSource, /sm:text-right/);
});

test("Y2. no muestra requested_source tecnico en filas", () => {
  assert.doesNotMatch(viewerSource, /step\.safe_message/);
  assert.doesNotMatch(viewerSource, /web_orchestrator_/);
});

test("Y3. duracion individual usa formato humano", () => {
  assert.match(viewerSource, /const totalSeconds = Math\.floor\(value\)/);
  assert.match(viewerSource, /const minutes = Math\.floor\(totalSeconds \/ 60\)/);
  assert.match(viewerSource, /const seconds = totalSeconds % 60/);
  assert.match(viewerSource, /return `\$\{seconds\} s`/);
  assert.match(viewerSource, /return `\$\{minutes\} min \$\{seconds\} s`/);
  assert.match(viewerSource, /formatDurationHuman\(step\.duration_seconds\)/);
});
test("Z. no crea jobs", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /orchestrator_create_job|create.*Job\(/);
});

test("AA. no llama Supabase", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /supabase|createClient|\.rpc\(/i);
});

test("AB. no ejecuta POST", () => {
  assert.doesNotMatch(mapperSource + viewerSource, /fetch\(|method:\s*"POST"|export async function POST/);
});

test("AC. no altera controles operacionales individuales", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/worker-health-check-button\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/source-connection-check-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-packs-update-control\.tsx$/m);
});

test("AD. no toca recuperacion", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery/m);
});

test("AE. estado ready sin iniciar", () => {
  assert.equal(map(fixtures.notStarted).status, "ready");
});

test("AF. claimed se trata como activo", () => {
  assert.equal(map([{ ...fixtures.step1Running[0], status: "claimed" }]).status, "running");
});

test("AG. tipos existentes conservan sanitizacion base", () => {
  assert.match(typesSource, /export function sanitizeOperationalText/);
});
