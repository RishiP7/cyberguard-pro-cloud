// app/src/billing.js
import Stripe from "stripe";
import pg from "pg";

const { DATABASE_URL, STRIPE_SECRET } = process.env;

// PG client
const pool = new pg.Pool({ connectionString: DATABASE_URL });
async function q(sql, params) {
  return pool.query(sql, params);
}

// Export Stripe client if configured
export const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

// Export setTenantPlan helper
export async function setTenantPlan(tenantId, plan) {
  if (!tenantId || !plan) return;
  await q(`UPDATE tenants SET plan=$2 WHERE tenant_id=$1`, [tenantId, plan]);
}