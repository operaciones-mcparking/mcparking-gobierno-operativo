declare module "pg" {
  export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
    rows: Row[];
  };

  export type QueryConfig = {
    query_timeout?: number;
    text: string;
    values?: unknown[];
  };

  export type PoolClient = {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: string | QueryConfig,
    ): Promise<QueryResult<Row>>;
    release(): void;
  };

  export type PoolConfig = {
    application_name?: string;
    connectionTimeoutMillis?: number;
    database?: string;
    host?: string;
    max?: number;
    password?: string;
    port?: number;
    query_timeout?: number;
    ssl?: {
      ca: string;
      rejectUnauthorized: boolean;
    };
    user?: string;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
  }
}
