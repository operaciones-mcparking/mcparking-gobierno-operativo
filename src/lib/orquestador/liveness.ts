import type { OrchestratorEvent, OrchestratorJob, OrchestratorWorker } from "./types";

export type JobProgress = {
  stage: string | null;
  substage: string | null;
  message: string | null;
  createdAt: string;
};

export type JobHealth = "HEALTHY_RUNNING" | "STALE_RUNNING" | "ORPHAN_SUSPECTED" | "UNKNOWN_BLOCKED";
export type WorkerHealth = "AVAILABLE" | "BUSY" | "STALE" | "OFFLINE_OR_UNKNOWN";

export type RecoveryCandidateJob = {
  jobId: string;
  lockedByWorkerId: string | null;
  status: string;
};

export type RecoveryResult = {
  dryRun: boolean;
  workerBefore: Record<string, unknown> | null;
  workerAfter: Record<string, unknown> | null;
  candidateJobs: RecoveryCandidateJob[];
  updatedJobs: RecoveryCandidateJob[];
  eventsInserted: number;
  activeJobsAfter: number;
  message: string | null;
};

export type RecoveryDryRunValidation =
  | { safe: true; candidate: RecoveryCandidateJob }
  | { safe: false; reason: "not-dry-run" | "candidate-mismatch" | "ambiguous" | "invalid-status" | "worker-mismatch" };

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function getLatestJobProgress(events: OrchestratorEvent[]): JobProgress | null {
  const progress = events
    .filter((event) => event.event_type === "worker_progress")
    .sort((a, b) => {
      const dateDifference = (timestampMs(b.created_at) ?? 0) - (timestampMs(a.created_at) ?? 0);
      return dateDifference || b.id - a.id;
    })[0];

  if (!progress) return null;

  return {
    stage: progress.stage,
    substage: progress.substage,
    message: progress.message,
    createdAt: progress.created_at,
  };
}

export function classifyJobHealth(input: {
  job: Pick<OrchestratorJob, "id" | "status" | "started_at" | "lastHeartbeatAt">;
  worker: Pick<OrchestratorWorker, "currentJobId" | "last_seen_at" | "startedAt"> | null;
  now?: Date;
}): JobHealth {
  if (input.job.status !== "running") return "UNKNOWN_BLOCKED";

  const nowMs = (input.now ?? new Date()).getTime();
  const heartbeatMs = timestampMs(input.job.lastHeartbeatAt);
  if (!Number.isFinite(nowMs) || heartbeatMs === null) return "UNKNOWN_BLOCKED";

  const heartbeatAgeSeconds = Math.max(0, (nowMs - heartbeatMs) / 1000);
  if (heartbeatAgeSeconds <= 90) return "HEALTHY_RUNNING";
  if (heartbeatAgeSeconds <= 300) return "STALE_RUNNING";

  if (!input.worker || input.worker.currentJobId !== input.job.id) return "UNKNOWN_BLOCKED";

  const workerLastSeenMs = timestampMs(input.worker.last_seen_at);
  const workerStartedMs = timestampMs(input.worker.startedAt);
  const jobStartedMs = timestampMs(input.job.started_at);
  if (workerLastSeenMs === null || workerStartedMs === null || jobStartedMs === null) return "UNKNOWN_BLOCKED";

  const workerSignalAgeSeconds = Math.max(0, (nowMs - workerLastSeenMs) / 1000);
  const restartBoundary = Math.max(heartbeatMs, jobStartedMs);
  return workerSignalAgeSeconds <= 90 && workerStartedMs > restartBoundary ? "ORPHAN_SUSPECTED" : "UNKNOWN_BLOCKED";
}

export function classifyWorkerHealth(
  worker: Pick<OrchestratorWorker, "status" | "currentJobId" | "last_seen_at">,
  now: Date = new Date(),
): WorkerHealth {
  const nowMs = now.getTime();
  const lastSeenMs = timestampMs(worker.last_seen_at);
  if (!Number.isFinite(nowMs) || lastSeenMs === null) return "OFFLINE_OR_UNKNOWN";

  const ageSeconds = Math.max(0, (nowMs - lastSeenMs) / 1000);
  if (ageSeconds > 300) return "OFFLINE_OR_UNKNOWN";
  if (ageSeconds > 90) return "STALE";
  if (worker.currentJobId || ["running", "busy"].includes(worker.status.toLowerCase())) return "BUSY";
  return "AVAILABLE";
}

export function validateRecoveryDryRun(
  result: RecoveryResult,
  expectedJobId: string,
  expectedWorkerId: string,
): RecoveryDryRunValidation {
  if (!result.dryRun) return { safe: false, reason: "not-dry-run" };
  if (result.candidateJobs.length !== 1) {
    return { safe: false, reason: result.candidateJobs.length > 1 ? "ambiguous" : "candidate-mismatch" };
  }

  const candidate = result.candidateJobs[0];
  if (candidate.jobId !== expectedJobId) return { safe: false, reason: "candidate-mismatch" };
  if (candidate.lockedByWorkerId !== expectedWorkerId) return { safe: false, reason: "worker-mismatch" };
  if (!new Set(["queued", "running"]).has(candidate.status)) return { safe: false, reason: "invalid-status" };

  return { safe: true, candidate };
}