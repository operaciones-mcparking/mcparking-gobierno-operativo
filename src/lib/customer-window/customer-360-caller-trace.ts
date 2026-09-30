import { randomUUID } from "node:crypto";

export type Customer360TraceRoute = "analytics" | "bookings" | "contacts" | "identity" | "overview";

export type Customer360TraceOutcome =
  | "configuration_error"
  | "ok"
  | "phase_blocked"
  | "rpc_error"
  | "rpc_rejected"
  | "timeout";

export type Customer360CallerTrace = {
  build: string;
  requestId: string;
  route: Customer360TraceRoute;
};

function traceBuild() {
  const value = process.env.VERCEL_GIT_COMMIT_SHA;
  return value && /^[a-f0-9]{7,40}$/i.test(value) ? value.slice(0, 12).toLowerCase() : "unknown";
}

export function traceCustomer360RpcCall(
  route: Customer360TraceRoute,
): Customer360CallerTrace | null {
  if (process.env.CUSTOMER360_CALLER_TRACE !== "1") return null;

  return { build: traceBuild(), requestId: randomUUID(), route };
}

export function traceCustomer360RpcOutcome(
  trace: Customer360CallerTrace | null,
  rpc: string,
  durationMs: number,
  outcome: Customer360TraceOutcome,
  phase: "all" | "confirmed" | "confirmed_related" | "off",
) {
  if (!trace) return;
  console.info(JSON.stringify({
    build: trace.build,
    durationMs: Math.max(0, Math.trunc(durationMs)),
    outcome,
    phase,
    requestId: trace.requestId,
    route: trace.route,
    rpc,
  }));
}
