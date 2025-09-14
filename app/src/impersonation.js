// server/impersonation.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// ---- configure PG (Render) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // set in Render
  ssl: { rejectUnauthorized: false },
});

// ---- helpers: auth/user/tenant context (adapt to your app) ----
// You likely already have something similar. Minimal shims below.
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}
function requireSuperAdmin(req, res, next) {
  if (!req.user?.is_super) return res.status(403).json({ error: 'forbidden' });
  next();
}
function requireTenantMember(req, res, next) {
  if (!req.user?.tenant_id) return res.status(403).json({ error: 'forbidden' });
  next();
}

// --- tiny cookie parser fallback (no external dep) ---
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (!out[k]) out[k] = v;
  }
  return out;
}
function ensureCookies(req) {
  if (!req.cookies) {
    req.cookies = parseCookieHeader(req.headers && req.headers.cookie);
  }
  return req.cookies;
}

// Attach impersonation cookie key
const IMP_COOKIE = 'impersonation_session_id';

// Middleware: load active impersonation session (if cookie present)
async function loadImpersonation(req, _res, next) {
  try {
    const cookies = ensureCookies(req);
    const sid = cookies && cookies[IMP_COOKIE];
    if (!sid) return next();

    const { rows } = await pool.query(
      `SELECT s.*, r.admin_id AS request_admin_id
         FROM impersonation_sessions s
         JOIN impersonation_requests r ON r.id = s.request_id
        WHERE s.id = $1::uuid
          AND s.active = true
          AND s.revoked_at IS NULL
          AND now() < s.expires_at`,
      [sid]
    );

    if (rows[0]) {
      req.impersonation = {
        session_id: rows[0].id,
        admin_id: rows[0].admin_id,
        tenant_id: rows[0].tenant_id,
        expires_at: rows[0].expires_at,
      };
      // IMPORTANT: only allow if current user is that admin
      if (req.user?.id !== rows[0].admin_id) {
        // Cookie belongs to another admin — ignore it.
        req.impersonation = undefined;
      }
    }
  } catch (e) {
    console.error('loadImpersonation error', e);
  }
  next();
}

// Attach tenant context (admin acting as tenant)
function attachTenantContext(req, _res, next) {
  // If impersonating, override effective tenant for downstream handlers.
  req.effectiveTenantId = req.impersonation?.tenant_id || req.user?.tenant_id || null;
  next();
}

// Utility: set or clear cookie
function setImpersonationCookie(res, sessionId) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  };
  if (!sessionId) {
    // clear
    res.clearCookie(IMP_COOKIE, { path: '/' });
  } else {
    res.cookie(IMP_COOKIE, sessionId, { ...opts }); // session cookie
  }
}

// ---- ROUTES ----

// Admin creates a request
router.post('/impersonation/request', requireAuth, requireSuperAdmin, async (req, res) => {
  const { tenant_id, reason, duration_minutes = 30 } = req.body || {};
  // clamp & sanitize duration to a safe window (5–240 minutes)
  const dm = Number.isFinite(+duration_minutes) ? Math.floor(+duration_minutes) : 30;
  const safeDuration = Math.min(240, Math.max(5, dm));
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO impersonation_requests
         (admin_id, tenant_id, reason, duration_minutes, status)
       VALUES ($1::uuid, $2::text, $3::text, $4::int, 'pending')
       RETURNING *`,
      [req.user.id, tenant_id, reason || null, safeDuration]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('create request error', e);
    res.status(500).json({ error: 'failed_to_create_request' });
  }
});

// Tenant lists/filters pending requests for their tenant
router.get('/impersonation/requests', requireAuth, requireTenantMember, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM impersonation_requests
        WHERE tenant_id = $1::text
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (e) {
    console.error('list requests error', e);
    res.status(500).json({ error: 'failed_to_list_requests' });
  }
});

// Tenant approves/denies request
router.post('/impersonation/:id/decision', requireAuth, requireTenantMember, async (req, res) => {
  const { id } = req.params;
  const { decision } = req.body || {}; // 'approved' | 'denied'
  if (!['approved', 'denied'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved|denied' });
  }
  try {
    // Only tenant of the request may act
    const { rows } = await pool.query(
      `UPDATE impersonation_requests
          SET status   = $1::text,
              acted_at = now(),
              actor_id = $2::uuid
        WHERE id = $3::uuid
          AND tenant_id = $4::text
          AND status = 'pending'
        RETURNING *`,
      [decision, req.user.id, id, req.user.tenant_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'request_not_found_or_already_acted' });
    res.json(rows[0]);
  } catch (e) {
    console.error('decision error', e);
    res.status(500).json({ error: 'failed_to_update_request' });
  }
});

// Admin starts impersonation AFTER approval (creates a session + sets cookie)
router.post('/impersonation/:id/start', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: reqRows } = await pool.query(
      `SELECT * FROM impersonation_requests
        WHERE id = $1::uuid
          AND admin_id = $2::uuid
          AND status = 'approved'`,
      [id, req.user.id]
    );
    const reqRow = reqRows[0];
    if (!reqRow) return res.status(400).json({ error: 'not_approved_or_not_yours' });

    const { rows: sessRows } = await pool.query(
      `INSERT INTO impersonation_sessions
         (request_id, admin_id, tenant_id, expires_at)
       VALUES ($1::uuid, $2::uuid, $3::text, now() + make_interval(mins => $4::int))
       RETURNING *`,
      [id, reqRow.admin_id, reqRow.tenant_id, reqRow.duration_minutes]
    );

    setImpersonationCookie(res, sessRows[0].id);
    res.json({ started: true, session: sessRows[0] });
  } catch (e) {
    console.error('start error', e);
    res.status(500).json({ error: 'failed_to_start' });
  }
});

// Admin or Tenant revokes the session (and clear cookie if admin)
router.post('/impersonation/:sessionId/revoke', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Load session to verify rights
    const { rows } = await pool.query(
      `SELECT s.*, r.admin_id, r.tenant_id
         FROM impersonation_sessions s
         JOIN impersonation_requests r ON r.id = s.request_id
        WHERE s.id = $1::uuid
          AND s.active = true
          AND s.revoked_at IS NULL`,
      [sessionId]
    );
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'session_not_found' });

    const isAdmin = req.user?.id === s.admin_id;
    const isTenant = req.user?.tenant_id === s.tenant_id;
    if (!isAdmin && !isTenant) return res.status(403).json({ error: 'forbidden' });

    const { rows: up } = await pool.query(
      `UPDATE impersonation_sessions
          SET active=false, revoked_at=now()
        WHERE id=$1::uuid
        RETURNING *`,
      [sessionId]
    );

    if (isAdmin) setImpersonationCookie(res, null);
    res.json({ revoked: true, session: up[0] });
  } catch (e) {
    console.error('revoke error', e);
    res.status(500).json({ error: 'failed_to_revoke' });
  }
});

// Who am I / Is admin impersonating now?
router.get('/impersonation/active', requireAuth, async (req, res) => {
  if (!req.impersonation) return res.json({ active: false });
  res.json({ active: true, ...req.impersonation });
});

module.exports = {
  router,
  loadImpersonation,
  attachTenantContext,
  requireAuth,
  requireSuperAdmin,
  requireTenantMember,
  ensureCookies,
  IMP_COOKIE,
};