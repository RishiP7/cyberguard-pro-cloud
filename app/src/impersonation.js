import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

// Ensure req.cookies exists even if cookie-parser wasn't mounted yet
export function ensureCookies(req, res, next) {
  if (req.cookies) return next();
  return cookieParser()(req, res, next);
}

// Placeholder: load impersonation token if/when you add one later
export function loadImpersonation(req, _res, next) {
  // Example scaffold (disabled until tokens exist):
  // try {
  //   const tok = req.cookies?.imp_token || null;
  //   if (tok) {
  //     const dec = jwt.decode(tok);
  //     if (dec?.tenant_id) req.impersonation = { tenant_id: dec.tenant_id, admin: dec.orig_admin || null };
  //   }
  // } catch {}
  next();
}

// Attach effective tenant context for downstream handlers
export function attachTenantContext(req, _res, next) {
  let effective = req.user?.tenant_id || null;
  if (req.impersonation?.tenant_id) effective = req.impersonation.tenant_id;
  req.effectiveTenantId = effective;
  next();
}

// Basic router placeholder so index.js can mount /admin safely
export const router = express.Router();

router.get('/impersonation/health', (_req, res) => {
  res.json({ ok: true, impersonation: 'shim', has_cookies: true });
});

// TODO: implement consented impersonation endpoints later:
// - POST /admin/impersonation/request
// - POST /admin/impersonation/approve /deny
// - POST /admin/impersonation/start (issue short-lived scoped token)
// - POST /admin/impersonation/revoke