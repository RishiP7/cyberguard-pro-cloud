#!/usr/bin/env bash
set -euo pipefail

MAIN="web-ready/src/main.jsx"
if [ ! -f "$MAIN" ]; then
  echo "❌ Not found: $MAIN (run from repo root)" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${MAIN}.bak_adminfix_${TS}"
cp "$MAIN" "$BACKUP"
echo "⏳ Backup -> $BACKUP"

node - <<'NODE'
const fs = require('fs');
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

// Find the AdminConsole function start (robust regex)
const m = /[\r\n]function\s+AdminConsolePage\s*\(/.exec(s);
if (!m) {
  console.log('• AdminConsolePage function not found; no changes made.');
  process.exit(0);
}
const fIdx = m.index;

// Look backwards for the *last* "return (" before AdminConsolePage
const before = s.slice(0, fIdx);
const lastReturn = before.lastIndexOf('return (');
if (lastReturn === -1) {
  console.log('• No "return (" before AdminConsolePage; skipping.');
  process.exit(0);
}

// From that return to the function start, do we see a well-formed `);` then `}`?
const tail = before.slice(lastReturn);
const hasCloseParenSemi = /\)\s*;/.test(tail);
const hasBraceAfter = hasCloseParenSemi && /\)\s*;\s*\}/.test(tail);

if (hasBraceAfter) {
  console.log('• Closure looks correct before AdminConsolePage; no change.');
  process.exit(0);
}

// Inject conservative closures right *before* the function
const injectAt = fIdx;
const inject = '\n</div>\n</div>\n</div>\n);\n}\n';
const out = s.slice(0, injectAt) + inject + s.slice(injectAt);
fs.writeFileSync(p, out, 'utf8');
console.log('✓ Injected missing closures before AdminConsolePage');
NODE

echo "🔧 Validate build (web-ready)…"
set +e
npm --prefix web-ready run build >/dev/null 2>&1
RC=$?
set -e

if [ $RC -ne 0 ]; then
  echo "⛔ Build failed — rolling back."
  cp "$BACKUP" "$MAIN"
  echo "✅ Rolled back $MAIN"
  exit 1
fi

echo "🎉 Build OK. Keep changes."
echo "👉 Commit: git add $MAIN && git commit -m 'fix: close Dashboard before AdminConsolePage' && git push"
