# ===== Config =====
REPO="RishiP7/cyberguard-pro-cloud"
OWNER="RishiP7"                             # GitHub user or org that owns the project
PROJECT_NAME="CyberGuard Pro – Customer Ready"
PROJECT_SHORT="CGP Customer Ready"

# ===== Create GitHub Project (v2) =====
# Creates a user-owned project (private). Use --public if you want it public.
PROJECT_ID=$(gh project create "$PROJECT_NAME" --owner "$OWNER" --format json --private | jq -r '.id')

# Add helpful fields/views (optional – GitHub auto-adds some defaults)
# (Skipping explicit field creation since Projects v2 includes Status/Priority/etc. by default)

# ===== Labels =====
for L in "area:frontend" "area:backend" "area:infra" "area:billing" "area:alerts" \
         "priority:now" "priority:next" "good first issue" \
         "type:bug" "type:feature" "type:chore" "type:docs" ; do
  gh label create "$L" -R "$REPO" --force >/dev/null
done

# ===== Milestones =====
gh api -X POST repos/$REPO/milestones -f title="MVP" -f description="Must-ship for first paying tenants" >/dev/null
gh api -X POST repos/$REPO/milestones -f title="Launch" -f description="Public onboarding / launch polish" >/dev/null

# Helper to create issue, label, milestone, and add to project
create_issue () {
  local TITLE="$1"; shift
  local BODY="$1"; shift
  local LABELS="$1"; shift
  local MILE="$1"; shift

  NUM=$(gh issue create -R "$REPO" -t "$TITLE" -b "$BODY" -l "$LABELS" -m "$MILE" --json number | jq -r '.number')
  # Add to project
  gh project item-add --owner "$OWNER" --project "$PROJECT_NAME" --url "https://github.com/$REPO/issues/$NUM" >/dev/null
  echo "Created #$NUM: $TITLE"
}

# ===== Issues (MVP) =====

create_issue \
"Fix boot/render stability in web-ready/src/main.jsx" \
"**Goal:** Keep the React boot section stable (no stray imports at tail, balanced braces).\n\n**Acceptance:**\n- Render tail is canonical and covered by a simple test (string check for `createRoot(...).render(` block).\n- CI check fails on diff from canonical tail.\n\n**Notes:** We had EOF/duplicate import regressions; lock the tail down and guard with CI." \
"area:frontend,priority:now,type:chore" "MVP"

create_issue \
"Alerts UX: clean list + click-to-expand details" \
"**Goal:** Keep alert rows one-line, ellipsize long text, details in modal/drawer.\n\n**Acceptance:**\n- No horizontal overflow on /alerts.\n- Export CSV works from current filters.\n- ‘Only anomalies’ + search + days persist and sanitize.\n- Empty states look good." \
"area:frontend,area:alerts,priority:now,type:feature" "MVP"

create_issue \
"Alerts API param allowlist & limits" \
"**Goal:** Backend rejects unknown/invalid params and clamps limits.\n\n**Acceptance:**\n- Query: `q`, `days`, `only_anomaly`, `levels`, `limit`, `offset` validated.\n- Limit ≤ 100, offset ≥ 0.\n- Returns helpful error JSON." \
"area:backend,area:alerts,priority:now,type:feature" "MVP"

create_issue \
"Billing: Pricing page → Stripe checkout + portal happy path" \
"**Goal:** Frontend checkout/portal calls return redirect URLs; coupon stored in localStorage.\n\n**Acceptance:**\n- `/pricing` buttons call `/billing/checkout` (plan + optional coupon) and redirect.\n- ‘Manage billing’ opens portal if paid.\n- Errors surfaced nicely." \
"area:frontend,area:billing,priority:now,type:feature" "MVP"

create_issue \
"Plan state refresh + trial banners" \
"**Goal:** Trial/plan changes reflect without hard reload.\n\n**Acceptance:**\n- Navbar/Trial banner updates when plan/trial changes (event: `me-updated`).\n- Trial end auto-refresh timer works if applicable." \
"area:frontend,area:billing,priority:next,type:feature" "MVP"

create_issue \
"Onboarding checklist & empty states" \
"**Goal:** Gentle guidance when a tenant is new.\n\n**Acceptance:**\n- Checklist shows connect-email, ingest first alerts, review, EDR, DNS.\n- Empty states link to Integrations/Test." \
"area:frontend,priority:next,type:feature" "MVP"

create_issue \
"Super-admin tooling (impersonate, tenant list, keys)" \
"**Goal:** Stabilize admin flows you already sketched.\n\n**Acceptance:**\n- Admin list loads reliably, keys rotate, impersonation stores admin backup token.\n- Add guardrails & error toasts." \
"area:frontend,area:backend,priority:next,type:feature" "MVP"

create_issue \
"Smoke tests: boot + critical routes" \
"**Goal:** Prevent regressions like blank screen.\n\n**Acceptance:**\n- Vitest/Cypress (pick one) to load `/`, `/login`, `/alerts`, `/pricing`.\n- Check for app shell + key elements, fail CI if missing." \
"area:frontend,priority:now,type:chore" "MVP"

# ===== Issues (Launch polish) =====

create_issue \
"Responsive polish & overflow clamps" \
"**Goal:** App looks good from 360px → 1440px.\n\n**Acceptance:**\n- Nav wraps gracefully.\n- All lists clamp/ellipsize.\n- No horizontal scrollbars." \
"area:frontend,priority:next,type:feature" "Launch"

create_issue \
"Error/empty/loading states audit" \
"**Goal:** Consistent card toasts and banners.\n\n**Acceptance:**\n- Unified small toast helper.\n- API errors mapped to friendly messages.\n- Empty states use the same component." \
"area:frontend,priority:next,type:chore" "Launch"

create_issue \
"Docs: quickstart + tenant setup" \
"**Goal:** Minimal docs for first tenants.\n\n**Acceptance:**\n- README (cloud) + /docs/quickstart.md.\n- Screenshots for Alerts/Integrations.\n- Link from app footer." \
"area:docs,priority:next,type:docs" "Launch"

echo "✅ Project created: $PROJECT_NAME"
echo "➡️  Open: gh project view \"$PROJECT_NAME\" --owner \"$OWNER\" --web"
