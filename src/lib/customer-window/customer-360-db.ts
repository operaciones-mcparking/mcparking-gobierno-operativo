import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

import {
  traceCustomer360RpcOutcome,
  type Customer360CallerTrace,
  type Customer360TraceOutcome,
} from "@/lib/customer-window/customer-360-caller-trace";
import type {
  Customer360ErrorCode,
  Customer360Locator,
  Customer360RepresentationType,
} from "@/lib/customer-window/customer-360-v1";

export const CUSTOMER360_RPC_NAMES = [
  "customer_window_360_v1_get_overview",
  "customer_window_360_v1_list_bookings",
  "customer_window_360_v1_list_observed_contacts",
  "customer_window_360_v1_get_boleta_analytics",
  "customer_window_360_v1_get_related_group_analytics",
  "customer_window_360_v1_get_global_review_overview",
  "customer_window_360_v1_list_global_review_bookings",
  "customer_window_360_v1_list_global_review_contacts",
  "customer_window_360_v1_get_global_review_analytics",
  "customer_window_360_v1_get_global_review_identity",
] as const;

export type Customer360RpcName = typeof CUSTOMER360_RPC_NAMES[number];
export type Customer360DedicatedDbPhase = "off" | "confirmed" | "confirmed_related" | "all";

type Customer360RpcInput = {
  p_contact_type?: "email" | "phone";
  p_locator: Customer360Locator;
  p_page?: number;
  p_page_size?: number;
};

type Customer360RpcDefinition = {
  representationTypes: readonly Customer360RepresentationType[];
  sql: string;
  values(input: Customer360RpcInput): unknown[];
};

const locatorOnlyValues = (input: Customer360RpcInput) => [input.p_locator];
const pagedValues = (input: Customer360RpcInput) => [input.p_locator, input.p_page, input.p_page_size];
const contactValues = (input: Customer360RpcInput) => [
  input.p_locator,
  input.p_contact_type,
  input.p_page,
  input.p_page_size,
];

const CUSTOMER360_RPC_ALLOWLIST: Record<Customer360RpcName, Customer360RpcDefinition> = {
  customer_window_360_v1_get_overview: {
    representationTypes: ["confirmed_customer", "related_review"],
    sql: "select public.customer_window_360_v1_get_overview($1::jsonb) as data",
    values: locatorOnlyValues,
  },
  customer_window_360_v1_list_bookings: {
    representationTypes: ["confirmed_customer", "related_review"],
    sql: "select public.customer_window_360_v1_list_bookings($1::jsonb, $2::integer, $3::integer) as data",
    values: pagedValues,
  },
  customer_window_360_v1_list_observed_contacts: {
    representationTypes: ["related_review"],
    sql: "select public.customer_window_360_v1_list_observed_contacts($1::jsonb, $2::text, $3::integer, $4::integer) as data",
    values: contactValues,
  },
  customer_window_360_v1_get_boleta_analytics: {
    representationTypes: ["confirmed_customer"],
    sql: "select public.customer_window_360_v1_get_boleta_analytics($1::jsonb) as data",
    values: locatorOnlyValues,
  },
  customer_window_360_v1_get_related_group_analytics: {
    representationTypes: ["related_review"],
    sql: "select public.customer_window_360_v1_get_related_group_analytics($1::jsonb) as data",
    values: locatorOnlyValues,
  },
  customer_window_360_v1_get_global_review_overview: {
    representationTypes: ["global_review"],
    sql: "select public.customer_window_360_v1_get_global_review_overview($1::jsonb) as data",
    values: locatorOnlyValues,
  },
  customer_window_360_v1_list_global_review_bookings: {
    representationTypes: ["global_review"],
    sql: "select public.customer_window_360_v1_list_global_review_bookings($1::jsonb, $2::integer, $3::integer) as data",
    values: pagedValues,
  },
  customer_window_360_v1_list_global_review_contacts: {
    representationTypes: ["global_review"],
    sql: "select public.customer_window_360_v1_list_global_review_contacts($1::jsonb, $2::text, $3::integer, $4::integer) as data",
    values: contactValues,
  },
  customer_window_360_v1_get_global_review_analytics: {
    representationTypes: ["global_review"],
    sql: "select public.customer_window_360_v1_get_global_review_analytics($1::jsonb) as data",
    values: locatorOnlyValues,
  },
  customer_window_360_v1_get_global_review_identity: {
    representationTypes: ["global_review"],
    sql: "select public.customer_window_360_v1_get_global_review_identity($1::jsonb) as data",
    values: locatorOnlyValues,
  },
};

const customer360ErrorCodes = new Set<Customer360ErrorCode>([
  "authority_not_found",
  "boleta_analytics_not_materialized",
  "related_group_analytics_not_materialized",
  "invalid_locator_contract",
  "representation_authority_unavailable",
  "representation_contract_unavailable",
  "representation_not_found",
  "stale_representation",
]);

export class Customer360DbError extends Error {
  constructor(
    readonly errorCode: Customer360ErrorCode,
    readonly outcome: Customer360TraceOutcome,
  ) {
    super(errorCode);
    this.name = "Customer360DbError";
  }
}

let customer360Pool: Pool | null = null;

function parsePhase(value: string | undefined): Customer360DedicatedDbPhase | null {
  return value === "off" || value === "confirmed" || value === "confirmed_related" || value === "all"
    ? value
    : null;
}

export function customer360DedicatedDbPhase(): Customer360DedicatedDbPhase | null {
  return parsePhase(process.env.CUSTOMER360_DEDICATED_DB_PHASE);
}

export function customer360PhaseAllowsRepresentation(
  phase: Customer360DedicatedDbPhase | null,
  representationType: Customer360RepresentationType,
) {
  if (!phase || phase === "off") return false;
  if (representationType === "confirmed_customer") return true;
  if (representationType === "related_review") return phase === "confirmed_related" || phase === "all";
  return phase === "all";
}

export function isCustomer360RepresentationEnabled(representationType: Customer360RepresentationType) {
  return customer360PhaseAllowsRepresentation(customer360DedicatedDbPhase(), representationType);
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Customer360DbError("representation_authority_unavailable", "configuration_error");
  return value;
}

function verifiedCa() {
  const ca = requiredEnvironment("CUSTOMER360_DB_CA_PEM").replace(/\\n/g, "\n");
  const expected = requiredEnvironment("CUSTOMER360_DB_CA_SHA256").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Customer360DbError("representation_authority_unavailable", "configuration_error");
  }
  const actual = createHash("sha256").update(ca, "utf8").digest();
  const expectedBytes = Buffer.from(expected, "hex");
  if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) {
    throw new Customer360DbError("representation_authority_unavailable", "configuration_error");
  }
  return ca;
}

function poolConfig(): PoolConfig {
  const port = Number(requiredEnvironment("CUSTOMER360_DB_PORT"));
  const applicationName = requiredEnvironment("CUSTOMER360_DB_APPLICATION_NAME");
  if (port !== 6543 || applicationName.length > 63 || !/^[a-z0-9._-]+$/i.test(applicationName)) {
    throw new Customer360DbError("representation_authority_unavailable", "configuration_error");
  }
  return {
    application_name: applicationName,
    connectionTimeoutMillis: 3_000,
    database: requiredEnvironment("CUSTOMER360_DB_NAME"),
    host: requiredEnvironment("CUSTOMER360_DB_HOST"),
    max: 2,
    password: requiredEnvironment("CUSTOMER360_DB_PASSWORD"),
    port,
    query_timeout: 10_000,
    ssl: { ca: verifiedCa(), rejectUnauthorized: true },
    user: requiredEnvironment("CUSTOMER360_DB_USER"),
  };
}

function dedicatedPool() {
  customer360Pool ??= new Pool(poolConfig());
  return customer360Pool;
}

function rpcDefinition(rpc: Customer360RpcName) {
  if (!Object.prototype.hasOwnProperty.call(CUSTOMER360_RPC_ALLOWLIST, rpc)) {
    throw new Customer360DbError("representation_contract_unavailable", "rpc_rejected");
  }
  return CUSTOMER360_RPC_ALLOWLIST[rpc];
}

function errorFromUnknown(error: unknown) {
  if (error instanceof Customer360DbError) return error;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "57014") {
    return new Customer360DbError("representation_contract_unavailable", "timeout");
  }
  if (typeof candidate.message === "string" && customer360ErrorCodes.has(candidate.message as Customer360ErrorCode)) {
    return new Customer360DbError(candidate.message as Customer360ErrorCode, "rpc_error");
  }
  return new Customer360DbError("representation_contract_unavailable", "rpc_error");
}

export function customer360DbErrorCode(error: unknown): Customer360ErrorCode {
  return errorFromUnknown(error).errorCode;
}

export async function executeCustomer360Rpc(
  rpc: Customer360RpcName,
  input: Customer360RpcInput,
  trace: Customer360CallerTrace | null = null,
): Promise<unknown> {
  const startedAt = Date.now();
  const phase = customer360DedicatedDbPhase();
  let outcome: Customer360TraceOutcome = "ok";
  let client: Awaited<ReturnType<Pool["connect"]>> | null = null;
  try {
    const definition = rpcDefinition(rpc);
    const representationType = input.p_locator.representationType;
    if (!customer360PhaseAllowsRepresentation(phase, representationType)
      || !definition.representationTypes.includes(representationType)) {
      outcome = "phase_blocked";
      throw new Customer360DbError("representation_authority_unavailable", outcome);
    }
    client = await dedicatedPool().connect();
    await client.query("begin transaction read only");
    await client.query("set local statement_timeout = '8s'");
    await client.query("set local lock_timeout = '2s'");
    const result = await client.query<{ data: unknown }>({
      query_timeout: 10_000,
      text: definition.sql,
      values: definition.values(input),
    });
    await client.query("commit");
    return result.rows[0]?.data ?? null;
  } catch (error) {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        // The original error remains authoritative.
      }
    }
    const normalized = errorFromUnknown(error);
    outcome = normalized.outcome;
    throw normalized;
  } finally {
    client?.release();
    traceCustomer360RpcOutcome(trace, rpc, Date.now() - startedAt, outcome, phase ?? "off");
  }
}
