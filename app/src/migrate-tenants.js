import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro', ssl:false });
async function main(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'trial',
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tenants_plan_idx ON tenants(plan);
  `);
  console.log('tenants ready');
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
