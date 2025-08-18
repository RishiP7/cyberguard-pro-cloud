import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro';
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

async function main(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'trial',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apikeys (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false
    );

    CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS tenants_plan_idx ON tenants(plan);
    CREATE INDEX IF NOT EXISTS apikeys_tenant_idx ON apikeys(tenant_id);
  `);
  console.log('users/tenants/apikeys tables ready');
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
