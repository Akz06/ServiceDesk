import pg, { type PoolClient, type QueryResultRow } from 'pg';

const { Pool } = pg;
const sslMode = process.env.PGSSLMODE;
// Only disable certificate validation when explicitly opted into (e.g. a provider's
// internal network uses a self-signed cert) — default to validating certs when SSL is on.
const rejectUnauthorized = process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslMode === 'require' ? { rejectUnauthorized } : false,
});

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}
