import { Pool as PgPool, PoolClient } from "pg";

export type Queryable = Pick<PgPool, "query"> | PoolClient;

let _pool: PgPool | null = null;

export function getPool(): PgPool {
  if (_pool) return _pool;
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

export const Pool = { get: getPool };

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
