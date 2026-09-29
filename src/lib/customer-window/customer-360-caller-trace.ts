import { randomUUID } from "node:crypto";

export type Customer360TraceRoute = "analytics" | "bookings" | "overview";

export type Customer360CallerTrace = {
  clientInfo: string;
  requestId: string;
};

function traceEnvironment() {
  const value = process.env.VERCEL_ENV;
  return value === "production" || value === "preview" || value === "development"
    ? value
    : "unknown";
}

function traceBuild() {
  const value = process.env.VERCEL_GIT_COMMIT_SHA;
  return value && /^[a-f0-9]{7,40}$/i.test(value) ? value.slice(0, 12).toLowerCase() : "unknown";
}

function traceDeploymentHost() {
  const value = process.env.VERCEL_URL;
  return value && value.length <= 253 && /^[a-z0-9.-]+(?::\d+)?$/i.test(value)
    ? value.toLowerCase()
    : "unknown";
}

export function traceCustomer360RpcCall(
  route: Customer360TraceRoute,
): Customer360CallerTrace | null {
  if (process.env.CUSTOMER360_CALLER_TRACE !== "1") return null;

  const requestId = randomUUID();
  const environment = traceEnvironment();
  const build = traceBuild();
  const deploymentHost = traceDeploymentHost();
  const timestamp = new Date().toISOString();
  const clientInfo = `mcparking-cw360/${route}/${environment}/${build}`;

  console.info(JSON.stringify({
    event: "customer360_rpc_call",
    route,
    requestId,
    environment,
    build,
    deploymentHost,
    timestamp,
  }));

  return { clientInfo, requestId };
}
