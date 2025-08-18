import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT||5432),
  database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
  ssl: (process.env.PGSSL||'').toLowerCase()==='true' ? { rejectUnauthorized:false } : undefined,
});
async function run(){
  await pool.query(`CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, event_json TEXT NOT NULL, score REAL NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at BIGINT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_subscriptions(tenant_id TEXT PRIMARY KEY, plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', updated_at TIMESTAMP NOT NULL DEFAULT NOW());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, passhash TEXT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_keys(api_key TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, created_at BIGINT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, alert_id TEXT NOT NULL, tenant_id TEXT NOT NULL, action TEXT NOT NULL, mode TEXT NOT NULL, target_kind TEXT, playbook TEXT, result_json TEXT, created_at BIGINT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS edr_events(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, host TEXT, process TEXT, cmdline TEXT, hash TEXT, file_ops JSONB, sev TEXT, ts BIGINT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dns_events(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, qname TEXT, qtype TEXT, resolved_ip TEXT, verdict TEXT, sev TEXT, ts BIGINT NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS log_events(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, source TEXT, principal TEXT, action TEXT, ip TEXT, geo TEXT, sev TEXT, ts BIGINT NOT NULL, raw_json JSONB);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS webhooks(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL, secret TEXT, enabled BOOLEAN NOT NULL DEFAULT true, created_at BIGINT NOT NULL);`);
  console.log("Migration complete (Phase 2 stubs).");
  await pool.end();
}
run().catch(e=>{console.error(e);process.exit(1)});
