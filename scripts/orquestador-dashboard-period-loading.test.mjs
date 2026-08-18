import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readFileSync("src/app/orquestador/orchestrator-dashboard-view.tsx", "utf8");
const client = readFileSync("src/app/dashboard-operacional/dashboard-operacional-client.tsx", "utf8");
const endpoint = readFileSync("src/app/api/dashboard/operacional/route.ts", "utf8");
const model = readFileSync("src/lib/dashboard/operacional.ts", "utf8");

assert.match(model, /timeZone: "America\/Santiago"/, "today must use the operational timezone");
assert.match(view, /const today = getOperationalDashboardTodayDate\(\)/);
assert.match(view, /from: today[\s\S]*to: today/, "SSR must request the same Today range shown by the selector");
assert.match(client, /dashboardMatchesRange\(initialDashboard, initialDateRangeRef\.current\) \? initialDashboard : null/);
assert.match(client, /setDateRange\(range\);\s*setDashboard\(null\);\s*setIsLoading\(true\);/, "changing period must hide old metrics before requesting the new range");
assert.match(client, /if \(!dashboardMatchesRange\(body\.dashboard, range\)\)/, "a mismatched response must never update the dashboard");
assert.match(client, /requestId !== activeRequestRef\.current/, "stale requests must remain unable to update state");
assert.match(client, /\{isLoading \? <div className="mt-5"><LoadingOverlay \/><\/div> : null\}/);
assert.match(client, /\{!isLoading && dashboard \? <>/, "metrics must stay hidden while the selected period is loading");
assert.match(client, /Cargando datos\.\.\./);
assert.match(client, /cache: "no-store"/);
assert.match(endpoint, /export const dynamic = "force-dynamic"/);

console.log("orquestador-dashboard-period-loading: 12/12 OK");