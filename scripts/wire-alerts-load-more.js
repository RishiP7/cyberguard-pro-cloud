import fs from 'fs';

const path = 'web-ready/src/main.jsx';
let src = fs.readFileSync(path, 'utf8');
const backup = path + '.bak_alerts_loadmore';
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, src, 'utf8');
  console.log('Backup saved:', backup);
}

let changed = false;

/**
 * A) URLSearchParams pattern: ensure qs.set('days', ...) exists in the load-more builder block
 * We’ll add after the first "const qs = new URLSearchParams(...)" that appears in AlertsPage
 * if we also see some "cursor", "offset", or "limit" use nearby.
 */
{
  const alertsBlock = /(function\s+AlertsPage\s*\([\s\S]*?\{)([\s\S]*?)(\n\s*return\s*\()/m;
  if (alertsBlock.test(src)) {
    src = src.replace(alertsBlock, (m, start, mid, ret) => {
      // If a qs is used for load more or filtering, make sure we set days.
      let mid2 = mid;
      const hasQS = /const\s+qs\s*=\s*new\s+URLSearchParams\(/.test(mid2);
      const setsDays = /qs\.set\(\s*['"]days['"]\s*,/.test(mid2);
      const looksLikeLoadMore = /(cursor|offset|page|limit)\s*/.test(mid2);
      if (hasQS && !setsDays && looksLikeLoadMore) {
        mid2 = mid2.replace(
          /(const\s+qs\s*=\s*new\s+URLSearchParams\([^\)]*\)\s*;?)/,
          `$1\n      qs.set('days', String(typeof days !== 'undefined' && days != null ? days : 7));`
        );
        changed = true;
        console.log('Added qs.set("days", ...) in AlertsPage (load more path).');
      }
      return start + mid2 + ret;
    });
  } else {
    console.warn('Could not parse AlertsPage block for URLSearchParams injection.');
  }
}

/**
 * B) Direct string/template fetches: add &days=... when missing.
 * We target calls like apiGet('/alerts?cursor=...'...) or apiGet(`/alerts?cursor=...`)
 * where "days=" is NOT already present.
 */
function addDaysToQuery(str) {
  // Skip if already has "days="
  if (/days\s*=/.test(str)) return str;
  // Already has ? -> append &days=...
  if (/\?/.test(str)) {
    return str.replace(/\)$/, `&days=\${encodeURIComponent(String(typeof days !== 'undefined' && days != null ? days : 7))}\`)`);
  }
  // No query yet -> add ?days=...
  return str.replace(/\)$/, `?days=\${encodeURIComponent(String(typeof days !== 'undefined' && days != null ? days : 7))}\`)`);
}

// Template string form: apiGet(`/alerts?...`)
{
  const reTpl = /apiGet\(\s*`\/alerts\?[^`]*`\s*\)/g;
  src = src.replace(reTpl, (m) => addDaysToQuery(m));
}
// Another template form: apiGet(`/alerts`)
{
  const reTpl2 = /apiGet\(\s*`\/alerts`\s*\)/g;
  const before = src;
  src = src.replace(reTpl2, (m) => addDaysToQuery(m));
  if (src !== before) {
    changed = true;
    console.log('Added days to template-string /alerts fetch.');
  }
}

// Single-quoted form: apiGet('/alerts?...')
{
  const reS = /apiGet$begin:math:text$\\s*'\\/alerts\\?[^']*'\\s*$end:math:text$/g;
  const patched = src.replace(reS, (m) => {
    if (/days=/.test(m)) return m; // already has days
    return m.replace(/'\s*\)$/, `'&days=\${encodeURIComponent(String(typeof days !== 'undefined' && days != null ? days : 7))}')`);
  });
  if (patched !== src) {
    src = patched;
    changed = true;
    console.log('Added days to single-quoted /alerts? fetch.');
  }
}

// Plain '/alerts' (no query) — only update if it’s clearly a load-more call (has cursor/offset nearby in same line or next line)
{
  const reLine = /apiGet$begin:math:text$\\s*'\\/alerts'\\s*$end:math:text$/g;
  let match;
  let newSrc = src;
  while ((match = reLine.exec(src)) !== null) {
    const idx = match.index;
    const lineStart = src.lastIndexOf('\n', idx) + 1;
    const lineEnd = src.indexOf('\n', idx);
    const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    // Peek next line too
    const nextLineStart = lineEnd + 1;
    const nextLineEnd = src.indexOf('\n', nextLineStart);
    const nextLine = src.slice(nextLineStart, nextLineEnd === -1 ? src.length : nextLineEnd);
    if (/(cursor|offset|page|after)=/.test(line) || /(cursor|offset|page|after)=/.test(nextLine)) {
      // Upgrade this call: '/alerts' -> `/alerts?days=${...}`
      const upgraded = line.replace(/apiGet$begin:math:text$\\s*'\\/alerts'\\s*$end:math:text$/, 'apiGet(`/alerts?days=${encodeURIComponent(String(typeof days !== \'undefined\' && days != null ? days : 7))}`)');
      newSrc = newSrc.slice(0, lineStart) + upgraded + newSrc.slice(lineEnd === -1 ? src.length : lineEnd);
      changed = true;
      console.log('Upgraded a plain /alerts (load more) to include days.');
    }
  }
  src = newSrc;
}

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('✅ Load-more days patch applied to', path);
} else {
  console.log('No changes applied (load-more already respects days).');
}
