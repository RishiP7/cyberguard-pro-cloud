try {
try {
  if (app && app._router && Array.isArray(app._router.stack)) {
    let seen = 0;
    for (let i = app._router.stack.length - 1; i >= 0; i--) {
      const layer = app._router.stack[i];
      if (
        layer &&
        layer.route &&
        layer.route.path === '/me' &&
        layer.route.methods &&
        layer.route.methods.get
      ) {
        seen++;
        // keep the most recent (this one), remove older ones
        if (seen > 1) {
          app._router.stack.splice(i, 1);
        }
      }
    }
  }
} catch (_e) { /* non-fatal */ }

// (Stray duplicate error-handling fragment removed)
// ---------- debug & diagnostics ----------
// Report commit/version (Render exposes RENDER_GIT_COMMIT)
app.get('/__version', (_req, res) => {
  res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null, started_at: new Date().toISOString() });
});

// Minimal /me variant that always returns error detail to help diagnose
app.get('/me_dbg', authMiddleware, async (req, res) => {
  await ensureDb();
  try {
    const r = await q(