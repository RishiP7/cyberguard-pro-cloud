import fs from 'fs';

const path = 'web-ready/src/main.jsx';
let src = fs.readFileSync(path, 'utf8');
const backup = path + '.bak_alerts_days';
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, src, 'utf8');
  console.log('Backup saved:', backup);
}

let changed = false;

/* ---- A) Insert buildExportHref helper inside AlertsPage (once) ---- */
if (!src.includes('function buildExportHref(q, onlyAnomaly, days)')) {
  // Inject the helper just before the first "return (" inside AlertsPage
  const reBeforeReturnInAlertsPage = /(function\s+AlertsPage\s*\([\s\S]*?\{)([\s\S]*?)(\n\s*return\s*\()/m;
  if (reBeforeReturnInAlertsPage.test(src)) {
    src = src.replace(
      reBeforeReturnInAlertsPage,
      (m, start, mid, ret) => {
        const helper = `
  function buildExportHref(q, onlyAnomaly, days){
    const d = (typeof days !== 'undefined' && days != null) ? days : 7;
    const parts = [
      \`format=csv\`,
      \`days=\${encodeURIComponent(String(d))}\`,
      \`limit=1000\`
    ];
    if (q) parts.push(\`q=\${encodeURIComponent(q)}\`);
    if (onlyAnomaly) parts.push(\`only_anomaly=1\`);
    return \`/alerts/export?\` + parts.join('&');
  }

`;
        return start + mid + helper + ret;
      }
    );
    changed = true;
    console.log('Inserted buildExportHref() inside AlertsPage.');
  } else {
    console.warn('Could not locate AlertsPage start/return to insert buildExportHref().');
  }
} else {
  console.log('buildExportHref() already present — skipping insert.');
}

/* ---- B) Point the Export CSV anchor to the helper ---- */
let rewiredHref = false;

// Pattern 1: anchor with title="Export filtered alerts to CSV"
src = src.replace(
  /(<a[^>]*title\s*=\s*"Export filtered alerts to CSV"[^>]*\s)href=\{[\s\S]*?\}/m,
  (m, head) => {
    rewiredHref = true;
    changed = true;
    return `${head}href={buildExportHref(q, onlyAnomaly, days)}`;
  }
);

// Pattern 2: any <a> that contains the text >Export CSV<
if (!rewiredHref) {
  // Match opening tag for the anchor that contains "Export CSV" between tags
  const reExportOpen = /<a([^>]*)>(\s*)Export CSV(\s*)<\/a>/m;
  if (reExportOpen.test(src)) {
    src = src.replace(reExportOpen, (full, attrs, aSpace, bSpace) => {
      // If href already present, replace its value; else inject href attr
      if (/href=/.test(attrs)) {
        attrs = attrs.replace(/href=\{[\s\S]*?\}/, 'href={buildExportHref(q, onlyAnomaly, days)}');
      } else {
        attrs = `${attrs} href={buildExportHref(q, onlyAnomaly, days)}`;
      }
      rewiredHref = true;
      changed = true;
      return `<a${attrs}>${aSpace}Export CSV${bSpace}</a>`;
    });
  }
}

console.log(rewiredHref
  ? 'Export CSV link now uses buildExportHref(...).'
  : 'WARNING: Could not rewire Export CSV href — please check the Alerts toolbar anchor.');

/* ---- C) Ensure Alerts list fetch includes ?days=... and reloads on change ---- */

/* C1: Replace a plain /alerts fetch with one that includes days.
   We try to find the first `apiGet('/alerts')` inside AlertsPage.
*/
let replacedFetch = false;
const reAlertsPageBlock = /(function\s+AlertsPage\s*\([\s\S]*?\{)([\s\S]*?)(\n\s*return\s*\()/m;
if (reAlertsPageBlock.test(src)) {
  src = src.replace(reAlertsPageBlock, (m, start, mid, ret) => {
    // Replace just the first plain '/alerts' call in this block
    const midReplaced = mid.replace(
      /apiGet\(\s*'\/alerts'\s*\)/,
      'apiGet(`/alerts?days=${encodeURIComponent(String(typeof days !== \'undefined\' && days != null ? days : 7))}`)'
    );
    if (mid !== midReplaced) {
      replacedFetch = true;
      changed = true;
      console.log('Alerts fetch now appends ?days=...');
    } else {
      console.warn('No plain apiGet(\'/alerts\') found to replace (maybe already parameterized).');
    }
    return start + midReplaced + ret;
  });
} else {
  console.warn('Could not parse AlertsPage block to update list fetch.');
}

/* C2: If code uses URLSearchParams, ensure days is set (best-effort). */
if (src.includes('new URLSearchParams(') && src.includes('/alerts?')) {
  // Insert a qs.set('days', ...) after first const qs = new URLSearchParams()
  src = src.replace(
    /(const\s+qs\s*=\s*new\s+URLSearchParams\(\s*\)\s*;?)/,
    `$1\n      qs.set('days', String(typeof days !== 'undefined' && days != null ? days : 7));`
  );
  changed = true;
  console.log('Added qs.set("days", ...) for URLSearchParams path.');
}

/* C3: Make the effect that calls load() re-run when days changes */
let effectUpdated = false;
src = src.replace(
  /React\.useEffect\(\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[\s*\]\s*\);/,
  (m) => {
    effectUpdated = true;
    changed = true;
    return 'React.useEffect(()=>{ load(); },[days]);';
  }
);
if (!effectUpdated) {
  // Try a looser match
  const reLoose = /React\.useEffect\(\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[\s*\s*\]\s*\);/;
  if (reLoose.test(src)) {
    src = src.replace(reLoose, 'React.useEffect(()=>{ load(); },[days]);');
    effectUpdated = true;
    changed = true;
  }
}
console.log(effectUpdated
  ? 'AlertsPage will reload when days changes.'
  : 'WARNING: Could not update useEffect dependency to [days] — please check AlertsPage effect.');

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('✅ Days wiring patch applied to', path);
} else {
  console.log('No changes applied (everything may already be wired).');
}
