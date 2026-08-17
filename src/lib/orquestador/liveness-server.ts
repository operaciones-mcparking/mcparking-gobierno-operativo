import "server-only";

import { getActiveAdminUser } from "./auth";
import {
  createRetryOrchestratorJob,
  getOrchestratorJobForRetry,
  listOrchestratorJobsForGuard,
  recoverOrchestratorStuckWorker,
  type RetrySourceJob,
} from "./supabase-admin";
import type { RecoveryResult } from "./liveness";
import type { OrchestratorJob } from "./types";

export type AuthorizedResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "invalid-input" | "not-found" | "invalid-status" | "rpc-error" | "composite-not-supported" | "duplicate-active" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireOrchestratorAdmin() {
  const admin = await getActiveAdminUser();
  if (!admin.ok) return { ok: false as const, reason: admin.reason === "unauthenticated" ? "unauthenticated" as const : "forbidden" as const };
  return { ok: true as const };
}

export async function recoverStuckWorkerAsAdmin(input: {
  workerId: string;
  recentHours: number;
  reason: string;
  dryRun: boolean;
}): Promise<AuthorizedResult<RecoveryResult>> {
  const authorization = await requireOrchestratorAdmin();
  if (!authorization.ok) return authorization;

  const workerId = input.workerId.trim();
  const reason = input.reason.trim();
  if (!workerId || workerId.length > 200 || !Number.isInteger(input.recentHours) || input.recentHours < 1 || input.recentHours > 168 || reason.length < 8 || reason.length > 500) {
    return { ok: false, reason: "invalid-input" };
  }

  const result = await recoverOrchestratorStuckWorker({ ...input, workerId, reason });
  return result.error || !result.data ? { ok: false, reason: "rpc-error" } : { ok: true, data: result.data };
}

export type RetrySourceJobResult = RetrySourceJob & {
  retryMode: "standalone-supported" | "composite-not-supported-yet";
};

export async function getRetrySourceJob(jobId: string): Promise<AuthorizedResult<RetrySourceJobResult>> {
  const authorization = await requireOrchestratorAdmin();
  if (!authorization.ok) return authorization;
  if (!uuidPattern.test(jobId)) return { ok: false, reason: "invalid-input" };

  const result = await getOrchestratorJobForRetry(jobId);
  if (result.error || !result.data) return { ok: false, reason: result.error ? "rpc-error" : "not-found" };
  if (result.data.status !== "failed") return { ok: false, reason: "invalid-status" };

  return {
    ok: true,
    data: {
      ...result.data,
      retryMode: result.data.compositeRunId ? "composite-not-supported-yet" : "standalone-supported",
    },
  };
}
const retryPayloadKeys = ["periodo", "modo", "mode", "action", "agent"] as const;

function retryIdentity(job: RetrySourceJob) {
  return JSON.stringify({
    jobType: job.jobType,
    targetWorkerId: job.targetWorkerId,
    payload: Object.fromEntries(retryPayloadKeys.map((key) => [key, job.payload[key] ?? null])),
  });
}

export async function retryStandaloneJobAsAdmin(jobId: string): Promise<AuthorizedResult<OrchestratorJob>> {
  const admin = await getActiveAdminUser();
  if (!admin.ok) return { ok: false, reason: admin.reason === "unauthenticated" ? "unauthenticated" : "forbidden" };
  if (!uuidPattern.test(jobId)) return { ok: false, reason: "invalid-input" };

  const sourceResult = await getOrchestratorJobForRetry(jobId);
  if (sourceResult.error || !sourceResult.data) return { ok: false, reason: sourceResult.error ? "rpc-error" : "not-found" };
  const source = sourceResult.data;
  if (source.status !== "failed") return { ok: false, reason: "invalid-status" };
  if (source.compositeRunId) return { ok: false, reason: "composite-not-supported" };
  if (source.priority === null) return { ok: false, reason: "invalid-input" };

  const activeJobs = await listOrchestratorJobsForGuard();
  if (activeJobs.error) return { ok: false, reason: "rpc-error" };
  const possibleDuplicates = activeJobs.data.filter((job) =>
    ["queued", "running"].includes(job.status) &&
    job.job_type === source.jobType &&
    job.worker_id === source.targetWorkerId,
  );
  const activeSources = await Promise.all(possibleDuplicates.map((job) => getOrchestratorJobForRetry(job.id)));
  if (activeSources.some((result) => result.data && retryIdentity(result.data) === retryIdentity(source))) {
    return { ok: false, reason: "duplicate-active" };
  }

  const created = await createRetryOrchestratorJob({ source, requestedBy: admin.user.id });
  return created.error || !created.data ? { ok: false, reason: "rpc-error" } : { ok: true, data: created.data };
}