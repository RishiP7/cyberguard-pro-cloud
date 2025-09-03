import fs from 'fs';

const path = 'web-ready/src/main.jsx';
let src = fs.readFileSync(path, 'utf8');
const backup = path + '.bak_ui_updates';
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, src, 'utf8');
  console.log('Backup saved:', backup);
}

let changed = false;

/* 1) Insert normalizeRisk helper after `const td = {...};` */
if (!src.includes('function normalizeRisk(')) {
  const tdMatch = src.match(/const\\s+td\\s*=\\s*\\{[\\s\\S]*?\\};/);
  if (tdMatch) {
    const inject = `
    
// ---- Risk normalization (unify labels) ----
function normalizeRisk(raw){
  const n = Number(raw);
  if (!isFinite(n)) return 0;
  // Already 0–100
  if (n >= 0 && n <= 100) return Math.round(n);
  // 0–1 → 0–100
  if (n > 0 && n < 1) return Math.round(n * 100);
  // -1..0 → 0–100
  if (n <= 0 && n >= -1) return Math.round(Math.abs(n) * 100);
  // Clamp/magnitude
  return Math.max(0, Math.min(100, Math.round(Math.abs(n))));
}
`;
    src = src.replace(tdMatch[0], tdMatch[0] + inject);
    changed = true;
    console.log('Inserted normalizeRisk helper.');
  } else {
    console.warn('Could not find const td {...}; — normalizeRisk not inserted.');
  }
} else {
  console.log('normalizeRisk already present — skipping insert.');
}

/* 2) Use normalizer in Dashboard risk calculations */

// A) Recent alerts list: const n = Number(a?.score||0);
if (src.includes('const n = Number(a?.score||0);')) {
  src = src.replace('const n = Number(a?.score||0);', 'const n = normalizeRisk(a?.score);');
  changed = true;
  console.log('Dashboard: recent alerts now use normalizeRisk.');
} else {
  // Try a safer variant if formatting differs slightly
  const reN = /const\\s+n\\s*=\\s*Number\\(a\\?\\.score\\|\\|0\\);/;
  if (reN.test(src)) {
    src = src.replace(reN, 'const n = normalizeRisk(a?.score);');
    changed = true;
    console.log('Dashboard: recent alerts (regex) now use normalizeRisk.');
  } else {
    console.warn('Could not find "const n = Number(a?.score||0);" — recent alerts untouched.');
  }
}

// B) Replace map(a=>Number(a?.score||0)) → map(a=>normalizeRisk(a?.score))
if (src.includes('map(a=>Number(a?.score||0))')) {
  src = src.replaceAll('map(a=>Number(a?.score||0))', 'map(a=>normalizeRisk(a?.score))');
  changed = true;
  console.log('Dashboard: replaced map(Number(score)) with normalizeRisk in series/overall.');
} else {
  console.warn('No "map(a=>Number(a?.score||0))" found — series/overall may already be normalized.');
}

/* 3) Insert BillingStatusChip component after TrialCountdownBadge */
if (!src.includes('function BillingStatusChip({ me })')) {
  const badgeRe = /(function\\s+TrialCountdownBadge[\\s\\S]*?\\n\\})/m;
  if (badgeRe.test(src)) {
    const chip = `
function BillingStatusChip({ me }){
  try{
    const status = String(me?.billing_status||'').toLowerCase();
    if(!status) return null;
    const map = { active:'#22c55e', trialing:'#7bd88f', past_due:'#f59e0b', payment_failed:'#ef4444', canceled:'#64748b' };
    const color = map[status] || 'rgba(255,255,255,.6)';
    return (
      <span title={\`Billing: \${status}\`} style={{marginRight:8, padding:'4px 10px', border:\`\${color}66\` ? \`1px solid \${color}66\` : '1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.04)', borderRadius:999, fontSize:12, boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)'}}>
        {status.replace('_',' ')}
      </span>
    );
  }catch(_e){ return null; }
}
`;
    src = src.replace(badgeRe, `$1\n\n${chip}`);
    changed = true;
    console.log('Inserted BillingStatusChip component.');
  } else {
    console.warn('Could not locate TrialCountdownBadge to insert BillingStatusChip after.');
  }
} else {
  console.log('BillingStatusChip already present — skipping insert.');
}

/* 4) Render BillingStatusChip in Layout header after TrialCountdownBadge */
if (!src.includes('<BillingStatusChip me={me} />')) {
  src = src.replace(
    /<TrialCountdownBadge\\s+me=\\{me\\}\\s*\\/>(?![\\s\\S]*<BillingStatusChip)/,
    '<TrialCountdownBadge me={me} />\n          <BillingStatusChip me={me} />'
  );
  if (src.includes('<BillingStatusChip me={me} />')) {
    changed = true;
    console.log('Wired BillingStatusChip into header.');
  } else {
    console.warn('Could not wire BillingStatusChip into header.');
  }
} else {
  console.log('BillingStatusChip already wired into header — skipping.');
}

/* 5) Insert Integration issues block before the "ribbonItems.length===0" EmptyState */
if (!src.includes('Integration issues</div>')) {
  const anchor = '{Array.isArray(ribbonItems) && ribbonItems.length===0 && (';
  const idx = src.indexOf(anchor);
  if (idx !== -1) {
    const block = `
{Array.isArray(ribbonItems) && ribbonItems.some(x => x.status==='error' || (x.last_error && String(x.last_error).trim())) && (
  <div style={{margin:'8px 0 12px', padding:'8px 10px', border:'1px solid rgba(255,100,100,.35)', background:'rgba(255,100,100,.08)', borderRadius:8}}>
    <div style={{fontWeight:600, marginBottom:6}}>Integration issues</div>
    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
      {ribbonItems.filter(x => x.status==='error' || (x.last_error && String(x.last_error).trim())).map((it,i)=>{
        const type = String(it.type||'unknown');
        const err = String(it.last_error||'error');
        async function reset(){ try{ await apiPost(\`/connectors/\${encodeURIComponent(type)}/reset\`,{}); alert(\`\${type}: reset requested\`); }catch(_e){ alert(\`\${type}: reset failed\`);} }
        function reauth(){ window.location.href = \`/integrations?reauth=\${encodeURIComponent(type)}\`; }
        return (
          <span key={i} style={{display:'inline-flex', alignItems:'center', gap:8, padding:'6px 8px', border:'1px solid rgba(255,100,100,.45)', borderRadius:8, background:'rgba(255,255,255,.04)'}}>
            <span style={{fontWeight:600, textTransform:'uppercase'}}>{type}</span>
            <span style={{opacity:.85, fontSize:12}} title={err}>error</span>
            <button className="ghost" onClick={reauth} style={{padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer'}}>Re-auth</button>
            {(me?.is_super || me?.role==='owner') && (
              <button className="ghost" onClick={reset} style={{padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer'}}>Reset connector</button>
            )}
          </span>
        );
      })}
    </div>
  </div>
)}
`;
    src = src.slice(0, idx) + block + src.slice(idx);
    changed = true;
    console.log('Inserted Integration issues block.');
  } else {
    console.warn('Could not find length===0 empty-state anchor — issues block not inserted.');
  }
} else {
  console.log('Integration issues block already present — skipping.');
}

if (changed) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('✅ Patch applied to', path);
} else {
  console.log('No changes applied (everything already present).');
}
