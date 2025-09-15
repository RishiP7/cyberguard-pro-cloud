
REPO="RishiP7/cyberguard-pro-cloud"

echo "==> Creating labels (idempotent)…"
mklabel() { gh label create "$1" -R "$REPO" --color "$2" --description "$3" 2>/dev/null || gh label edit "$1" -R "$REPO" --color "$2" --description "$3"; }

mklabel "sprint:2"           "BFD4F2" "Sprint 2 items"

mklabel "area:alerts"        "D4C5F9" "Alerts system"
mklabel "area:admin"         "F9D0C4" "Admin & impersonation"
mklabel "area:support"       "C2F9C4" "Support / helpdesk"
mklabel "area:integrations"  "FAE8B4" "3rd party integrations"
mklabel "area:platform"      "B4E8FA" "Build/deploy/platform"
mklabel "area:website"       "E8B4FA" "Marketing/website/legal"

mklabel "type:ux"            "5319E7" "UX/UI tasks"
mklabel "type:feature"       "1D76DB" "Feature work"
mklabel "type:enhancement"   "FBCA04" "Enhancement"
mklabel "type:devex"         "0052CC" "Developer experience"
mklabel "type:content"       "0E8A16" "Docs/website/content"
mklabel "type:qa"            "E99695" "QA/Testing"

mklabel "priority:P1"        "B60205" "Highest priority"
mklabel "priority:P2"        "D93F0B" "Medium priority"
mklabel "priority:P3"        "FBCA04" "Lower priority"

echo "==> Creating Sprint 2 issues…"

new_issue () {
  local TITLE="$1"
  local BODY="$2"
  local LABELS="$3"
  gh issue create -R "$REPO" -t "$TITLE" -b "$BODY" -l "$LABELS"
}

new_issue "Alerts list: risk chips + normalization" \
"Show CRITICAL/HIGH/MEDIUM/LOW chips and normalize scores (0–100) → labels.

**Acceptance**
- Score→label mapping: ≥80 critical, ≥60 high, ≥30 medium, else low
- Chip UI on /alerts with tooltips and color
- Server returns score consistently

**Tasks**
- UI: chip component + mapping
- API: ensure score present/consistent
- Tests: sample alerts render with correct chips" \
"sprint:2,type:ux,area:alerts,priority:P2"

new_issue "Admin: super-admin plan preview (Pro+) + docs" \
"Let super-admins preview Pro+ features locally without touching billing by setting \`localStorage.admin_plan_preview='pro_plus'\`.

**Acceptance**
- Preview takes effect only for super-admin sessions
- Clear label/badge in UI when preview is active
- Docs in README/ADMIN.md on how to enable/disable

**Tasks**
- Gate in planCapabilities()
- Add small banner “Admin preview: Pro+”
- Add docs" \
"sprint:2,type:feature,area:admin,priority:P2"

new_issue "Support page MVP (/support)" \
"Minimal support/contact form with honeypot; posts to /support/send.

**Acceptance**
- Name, Email, Message; success and error states
- Honeypot blocks bots
- Link in sidebar & footer

**Tasks**
- UI form + validation
- API endpoint + basic rate limit
- QA happy-path + error handling" \
"sprint:2,type:feature,area:support,priority:P2"

new_issue "Live Status Ticker on Dashboard" \
"Scrolling status chips fed from alerts/integrations/action summaries.

**Acceptance**
- Shows Today alerts, Integrations OK/pending/error, AI actions counts
- Auto-refresh every 30s
- Graceful fallback when no data

**Tasks**
- Summaries API calls
- Ticker animation + reduced-motion support
- Tests for empty/error states" \
"sprint:2,type:enhancement,area:platform,priority:P3"

new_issue "Integrations: richer health & status badges" \
"Expose richer health per connector and surface in UI with auto-refresh.

**Acceptance**
- Status, last_sync, last_error, next_retry visible
- Health derived from recent ingest

**Tasks**
- API fields
- UI badges/tooltips
- Synthetic tests" \
"sprint:2,type:enhancement,area:integrations,priority:P2"

new_issue "Build/Deploy Watchdog (post-deploy smoke + alert)" \
"Automated check after Render deploy to catch blank screen.

**Acceptance**
- Headless checks: #root mounts, React present, /me 200/401 (not 404)
- Alert on failure, rollback guidance

**Tasks**
- Hook via GitHub Action/Render
- Playwright or Lighthouse CI
- Slack/email alerting" \
"sprint:2,type:devex,area:platform,priority:P1"

new_issue "Legal & Website links (Privacy, Terms, SLA)" \
"Ship MVP legal pages and link from app + marketing.

**Acceptance**
- /legal routes live
- Footer links on login + in-app

**Tasks**
- Static pages
- Footer component
- Copy review" \
"sprint:2,type:content,area:website,priority:P3"

new_issue "QA checklist tracking (Sprint 2)" \
"Track all QA bullets to closure; break out P1s.

**Tasks**
- Convert bullets to sub-issues
- Prioritize and assign owners" \
"sprint:2,type:qa,priority:P1"

new_issue "Admin-only: Tenant impersonation with tenant consent" \
"Allow super-admins to impersonate a tenant **only with tenant approval** via an in-app consent prompt.

**Acceptance**
- Admin UI: select tenant → request impersonation
- Tenant sees modal: who, what, duration; Approve/Deny
- Session flagged as “impersonating” with visible banner + escape hatch
- All actions audited: who impersonated whom, when, and for how long
- Backend token scope reduced to tenant; automatic expiry

**Tasks**
- API: create request (POST /admin/impersonation/request), list, approve/deny, exchange token with scope+expiry
- UI (Admin): request screen + status, cancel
- UI (Tenant): approval modal + notification
- Security: audit log, short-lived tokens, banner, revoke on logout" \
"sprint:2,type:feature,area:admin,priority:P1"

echo "✅ Done. Issues created and labeled for Sprint 2."
