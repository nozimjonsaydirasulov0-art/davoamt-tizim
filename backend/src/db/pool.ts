import pg from 'pg';
import { config } from '../config.js';

// NUMERIC -> number, DATE -> 'YYYY-MM-DD' string
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });

export type Db = pg.Pool | pg.PoolClient;

/** Parametrli so'rov — SQL injectiondan himoya: qiymatlar hech qachon SQL matniga qo'shilmaydi */
export async function q<T = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(text, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(text, params, db);
  return rows[0] ?? null;
}

/** Tranzaksiya: xato bo'lsa hammasi ROLLBACK */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
