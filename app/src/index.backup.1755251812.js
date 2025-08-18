import express from "express";
import cors from "cors";
import { Pool } from "pg";

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());

// ---- Admin auth middleware ----
function adminMiddleware(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

// ---- Example normal endpoint ----
app.get("/", (req, res) => {
  res.json({ ok: true, service: "CyberGuard Pro API" });
});

// ================= ADMIN ROUTES =================

// List tenants (summary)
app.get("/admin/tenants", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.plan, t.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS users,
        (SELECT COUNT(*) FROM apikeys k WHERE k.tenant_id=t.id AND NOT k.revoked) AS active_keys,
        (SELECT MAX(created_at) FROM alerts a WHERE a.tenant_id=t.id) AS last_alert
      FROM tenants t
      ORDER BY t.created_at DESC
      LIMIT 500
    `);
    res.json({ ok: true, tenants: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenants failed" });
  }
});

// Tenant profile (no raw events)
app.get("/admin/tenant/:id", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,name,plan,contact_email,notes,is_demo,created_at,updated_at FROM tenants WHERE id=$1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "tenant not found" });
    res.json({ ok: true, tenant: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenant get failed" });
  }
});

// Update tenant metadata
app.patch("/admin/tenant/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, contact_email, notes, is_demo, plan } = req.body || {};
    const fields = [], vals = [];
    let i = 1;
    if (typeof name === "string") { fields.push(`name=$${i++}`); vals.push(name); }
    if (typeof contact_email === "string") { fields.push(`contact_email=$${i++}`); vals.push(contact_email); }
    if (typeof notes === "string") { fields.push(`notes=$${i++}`); vals.push(notes); }
    if (typeof is_demo === "boolean") { fields.push(`is_demo=$${i++}`); vals.push(is_demo); }
    if (typeof plan === "string") { fields.push(`plan=$${i++}`); vals.push(plan); }
    fields.push(`updated_at=EXTRACT(EPOCH FROM NOW())`);
    if (vals.length === 0) return res.json({ ok: true, updated: false });
    vals.push(req.params.id);
    const sql = `UPDATE tenants SET ${fields.join(", ")} WHERE id=$${i}
                 RETURNING id,name,plan,contact_email,notes,is_demo,created_at,updated_at`;
    const { rows } = await pool.query(sql, vals);
    res.json({ ok: true, tenant: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin tenant patch failed" });
  }
});

// List tenant API keys
app.get("/admin/tenant/:id/keys", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,created_at,revoked FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json({ ok: true, keys: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "admin keys failed" });
  }
});

// Revoke a key
app.post("/admin/revoke-key", adminMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await pool.query("UPDATE apikeys SET revoked=true WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "revoke key failed" });
  }
});

// =================================================

// Listen
app.listen(PORT, () => {
  console.log(`CyberGuard Pro API listening on :${PORT}`);
});