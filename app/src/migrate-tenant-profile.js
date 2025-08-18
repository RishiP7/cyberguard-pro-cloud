import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro',
  ssl: false
});
async function main(){
  await pool.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS contact_email TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS updated_at BIGINT;
    UPDATE tenants SET updated_at = EXTRACT(EPOCH FROM NOW()) WHERE updated_at IS NULL;
  `);
  console.log('tenant profile columns ready');
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
