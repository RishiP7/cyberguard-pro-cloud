import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://cybermon:cybermon@localhost:5432/cyberguardpro';
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

async function main(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apikeys (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS apikeys_tenant_idx ON apikeys(tenant_id);
    CREATE INDEX IF NOT EXISTS apikeys_revoked_idx ON apikeys(revoked);
  `);
  console.log('apikeys table ready');
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
