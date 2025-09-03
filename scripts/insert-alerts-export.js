const fs = require('fs');
const path = 'web-ready/src/main.jsx';

let src = fs.readFileSync(path, 'utf8');

// Make a backup once
const backup = path + '.bak_alerts_export';
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, src, 'utf8');
}

// We’ll look for the Alerts search input container and insert a toolbar after it.
// Match a <div ...> ... <input ... placeholder="Search..." ... /> ... </div>
const re = new RegExp(
  // opening div (often the search container)
  String.raw`(<div[^>]*>\s*` +
  // any content before input
  String.raw`(?:(?!<\/div>)[\s\S])*?` +
  // the input with placeholder starting with "Search"
  String.raw`<input[^>]*placeholder\s*=\s*"(?:Search[^"]*)"` +
  // any content until the closing div of this container
  String.raw`(?:(?!<\/div>)[\s\S])*?<\/div>)`
, 'm');

if (!re.test(src)) {
  console.error('Could not find the search input container in AlertsPage. No changes made.');
  process.exit(1);
}

const toolbar = `
{/* Toolbar buttons */}
<div style={{display:'flex', gap:8, marginBottom:12}}>
  <a
    href={
      \`/alerts/export?format=csv&days=\${typeof days!=="undefined" ? days : 7}&limit=1000\`
      + (q ? \`&q=\${encodeURIComponent(q)}\` : '')
      + (onlyAnomaly ? \`&only_anomaly=1\` : '')
    }
    title="Export filtered alerts to CSV"
    style={{
      padding:'8px 10px',
      borderRadius:8,
      border:'1px solid rgba(255,255,255,.2)',
      background:'transparent',
      color:'#e6e9ef',
      textDecoration:'none',
      whiteSpace:'nowrap'
    }}
  >
    Export CSV
  </a>
  <button
    style={{padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.06)', color:'#e6e9ef', cursor:'pointer'}}
    onClick={()=>setQ('')}
  >
    Clear Search
  </button>
</div>
`;

// Insert the toolbar immediately after the closing </div> of the search container.
src = src.replace(re, `$1\n${toolbar}`);

fs.writeFileSync(path, src, 'utf8');
console.log('Inserted Export CSV toolbar under the Alerts search bar.');
console.log('Backup saved at:', backup);
