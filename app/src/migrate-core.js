import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro',
  ssl: false
});

async function main(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      event_json JSONB NOT NULL,
      score NUMERIC NOT NULL,
      status TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS alerts_tenant_idx ON alerts(tenant_id);
    CREATE INDEX IF NOT EXISTS alerts_created_idx ON alerts(created_at DESC);

    CREATE TABLE IF NOT EXISTS actions (
      id UUID PRIMARY KEY,
      alert_id UUID NOT NULL,
      action TEXT NOT NULL,
      target_kind TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS actions_alert_idx ON actions(alert_id);
  `);
  console.log('alerts/actions tables ready');
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
