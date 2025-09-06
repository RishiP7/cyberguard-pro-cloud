#!/usr/bin/env bash
set -euo pipefail

MAIN="web-ready/src/main.jsx"
if [ ! -f "$MAIN" ]; then
  echo "❌ Not found: $MAIN (run from repo root)" >&2
  exit 1
fi

mkdir -p scripts
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${MAIN}.bak_adminfix_${TS}"

echo "⏳ Backing up $MAIN -> $BACKUP"
cp "$MAIN" "$BACKUP"

echo "🛠  Applying safe closure fix (only if missing)…"
node - <<'NODE'
const fs = require('fs');
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

const marker = '\n// ---- Admin Console (sidebar wrapper) ----';
const mIdx = s.indexOf(marker);
if (mIdx === -1) {
  console.log('• AdminConsolePage marker not found; no changes made.');
  process.exit(0);
}

// Take a window of code before the marker to inspect
const before = s.slice(0, mIdx);
const after  = s.slice(mIdx);

// Heuristic: find the *last* "return (" before the marker.
// If from that point to the marker we DO NOT see a well-formed " ); } ",
// inject a conservative closing sequence right before the marker.
const lastReturnIdx = before.lastIndexOf('return (');

let needsClose = false;
if (lastReturnIdx !== -1) {
  const tail = before.slice(lastReturnIdx);
  // Look for a ")\s*;\s*}" after that return(…)
  needsClose = !/\)\s*;\s*\}/.test(tail);
} else {
  // If we can’t even find a return(, play safe and do nothing.
  console.log('• No "return (" found before AdminConsole marker; skipping.');
  process.exit(0);
}

if (!needsClose) {
  console.log('• Closure appears correct before AdminConsole; no change.');
  process.exit(0);
}

// Build the injected sequence: close any open container divs, then the React return and function.
const inject = '\n</div>\n</div>\n</div>\n);\n}\n';

const out = before.replace(/\s*$/, '') + inject + '\n' + after.replace(/^\n*/, '');
fs.writeFileSync(p, out, 'utf8');
console.log('✓ Injected missing closure before AdminConsolePage');
NODE

echo "🔧 Validating with a local build (web-ready)…"
set +e
npm --prefix web-ready run build >/dev/null 2>&1
BUILD_RC=$?
set -e

if [ $BUILD_RC -ne 0 ]; then
  echo "⛔ Build failed — rolling back to backup."
  cp "$BACKUP" "$MAIN"
  echo "✅ Rolled back $MAIN"
  exit 1
fi

echo "🎉 Build OK. Keeping changes."
echo "ℹ️  You can commit now:"
echo "    git add $MAIN && git commit -m 'fix: close Dashboard before AdminConsolePage' && git push"
