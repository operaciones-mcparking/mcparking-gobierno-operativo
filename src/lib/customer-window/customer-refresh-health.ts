export type CustomerWindowRefreshStatus = "healthy" | "refreshing" | "stale" | "error";
export type CustomerWindowRetentionStatus = "active" | "draining" | "error" | "unknown";

export type CustomerWindowRefreshHealth = {
  activeSnapshotActivatedAt: string | null;
  activeSnapshotId: string | null;
  cadenceMinutes: 30;
  containsPii: false;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorPhase: string | null;
  lastSuccessAt: string | null;
  retentionLastDeletedSnapshotId: string | null;
  retentionRemaining: number;
  retentionStatus: CustomerWindowRetentionStatus;
  status: CustomerWindowRefreshStatus;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCodePattern = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const refreshStatuses = new Set<CustomerWindowRefreshStatus>([
  "healthy", "refreshing", "stale", "error",
]);
const retentionStatuses = new Set<CustomerWindowRetentionStatus>([
  "active", "draining", "error", "unknown",
]);

function nullableTimestamp(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value))
    ? value : undefined;
}

function nullableUuid(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && uuidPattern.test(value) ? value : undefined;
}

function nullableSafeCode(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && safeCodePattern.test(value) ? value : undefined;
}

export function normalizeCustomerWindowRefreshHealth(
  value: unknown,
): CustomerWindowRefreshHealth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  const retentionStatus = row.retentionStatus;
  const lastSuccessAt = nullableTimestamp(row.lastSuccessAt);
  const lastAttemptAt = nullableTimestamp(row.lastAttemptAt);
  const activeSnapshotId = nullableUuid(row.activeSnapshotId);
  const activeSnapshotActivatedAt = nullableTimestamp(row.activeSnapshotActivatedAt);
  const retentionLastDeletedSnapshotId = nullableUuid(row.retentionLastDeletedSnapshotId);
  const lastErrorCode = nullableSafeCode(row.lastErrorCode);
  const lastErrorPhase = nullableSafeCode(row.lastErrorPhase);
  if (!refreshStatuses.has(status as CustomerWindowRefreshStatus)
    || !retentionStatuses.has(retentionStatus as CustomerWindowRetentionStatus)
    || lastSuccessAt === undefined || lastAttemptAt === undefined
    || activeSnapshotId === undefined || activeSnapshotActivatedAt === undefined
    || retentionLastDeletedSnapshotId === undefined
    || lastErrorCode === undefined || lastErrorPhase === undefined
    || row.cadenceMinutes !== 30 || row.containsPii !== false
    || !Number.isSafeInteger(row.retentionRemaining)
    || (row.retentionRemaining as number) < 0) return null;

  return {
    activeSnapshotActivatedAt,
    activeSnapshotId,
    cadenceMinutes: 30,
    containsPii: false,
    lastAttemptAt,
    lastErrorCode,
    lastErrorPhase,
    lastSuccessAt,
    retentionLastDeletedSnapshotId,
    retentionRemaining: row.retentionRemaining as number,
    retentionStatus: retentionStatus as CustomerWindowRetentionStatus,
    status: status as CustomerWindowRefreshStatus,
  };
}
