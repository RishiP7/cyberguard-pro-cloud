import fs from 'node:fs';

const path = 'web-ready/src/main.jsx';
let src = fs.readFileSync(path, 'utf8');
const backup = path + '.bak_alerts_fix_' + Date.now();
fs.writeFileSync(backup, src, 'utf8');

let changed = false;

// 1) Insert helpers inside AlertsPage after days/onlyAnomaly state
{
  const alertsHead = /function\s+AlertsPage\s*\([^)]*\)\s*\{[\s\S]*?const\s*\[\s*days\s*,\s*setDays\s*\][\s\S]*?;\s*const\s*\[\s*onlyAnomaly\s*,\s*setOnlyAnomaly\s*\][\s\S]*?;/m;
  if (alertsHead.test(src) && !src.includes('function normDays(')) {
    src = src.replace(alertsHead, (m) => {
      return m + `

  // --- Alerts query helpers (sanitize/normalize) ---
  function normDays(x){
    const n = parseInt(x, 10);
    return (Number.isFinite(n) && n > 0) ? String(n) : '7';
  }
  function cleanQ(s){
    if (!s) return '';
    const t = String(s).trim();
    // Avoid backend pattern errors from single-character queries
    return t.length >= 2 ? t : '';
  }
  function buildAlertsQS({ q, days, onlyAnomaly, levels, limit, offset }){
    const qs = new URLSearchParams();
    qs.set('days', normDays(days));
    const cq = cleanQ(q);
    if (cq) qs.set('q', cq);
    if (onlyAnomaly) qs.set('only_anomaly', '1');
    if (Array.isArray(levels) && levels.length) qs.set('levels', levels.join(','));
    if (limit) qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    return qs.toString();
  }
`;
    });
    changed = true;
    console.log('Inserted sanitize helpers (normDays/cleanQ/buildAlertsQS).');
  } else {
    console.log('Helpers already present or AlertsPage not matched — skipping insert.');
  }
}

// 2) Wire Export CSV to use helper & respect filters/days
{
  const reCsv = /<a[^>]*>\s*Export\s+CSV\s*<\/a>/m;
  if (reCsv.test(src)) {
    src = src.replace(
      reCsv,
      `<a href={'/alerts/export?format=csv&' + buildAlertsQS({ q, days, onlyAnomaly, levels, limit: 1000 })} style={{padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer'}}>Export CSV</a>`
    );
    changed = true;
    console.log('Rewired Export CSV href to use buildAlertsQS().');
  } else {
    console.log('Could not find Export CSV anchor — skipping.');
  }
}

// 3) Main list fetch: ensure it uses helper
{
  const reFetch = /fetch\(\s*`?\$\{API_BASE\}\/alerts\?[^`)]+`?\s*\)/g;
  let count = 0;
  src = src.replace(reFetch, () => {
    count++;
    return "(() => { const listQs = buildAlertsQS({ q, days, onlyAnomaly, levels, limit: pageSize, offset }); return fetch(`${API_BASE}/alerts?${listQs}`) })()";
  });
  if (count) {
    changed = true;
    console.log(`Updated ${count} alert-list fetch call(s) to use buildAlertsQS().`);
  } else {
    console.log('No list fetch calls matched (maybe already updated).');
  }
}

// 4) Load more (+50) fetch: ensure it uses helper
{
  const reMore = /fetch\(\s*`?\$\{API_BASE\}\/alerts\?[^`)]+limit=50[^`)]+`?\s*\)/g;
  let count = 0;
  src = src.replace(reMore, () => {
    count++;
    return "(() => { const moreQs = buildAlertsQS({ q, days, onlyAnomaly, levels, limit: 50, offset: nextOffset }); return fetch(`${API_BASE}/alerts?${moreQs}`) })()";
  });
  if (count) {
    changed = true;
    console.log(`Updated ${count} load-more fetch call(s) to use buildAlertsQS().`);
  } else {
    console.log('No load-more fetch calls matched (maybe already updated).');
  }
}

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('✅ Patch applied to', path);
  console.log('   Backup saved at', backup);
} else {
  console.log('No changes written. (Either already patched or patterns not found.)');
}
