import fs from 'fs';

const MAIN = 'web-ready/src/main.jsx';
const PKG  = 'package.json';

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s,'utf8'); }

// -------- main.jsx changes --------
let s = read(MAIN);

// (A) Footer block (insert just before <AIDock me={me} />)
{
  const needle = /(\{children\}\s*\n\s*)(<AIDock\b)/;
  if (needle.test(s) && !s.includes('Global footer (legal & support)')) {
    s = s.replace(needle, `$1
        {/* --- Global footer (legal & support) --- */}
        <div style={{marginTop:18, paddingTop:12, borderTop:'1px solid rgba(255,255,255,.10)', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, opacity:.85}}>
          <div>© {new Date().getFullYear()} CyberGuard Pro</div>
          <div style={{display:'flex', gap:12}}>
            <Link to="/support" style={{color:'#9ec3ff', textDecoration:'none'}}>Support</Link>
            <Link to="/legal/privacy" style={{color:'#9ec3ff', textDecoration:'none'}}>Privacy</Link>
            <Link to="/legal/terms" style={{color:'#9ec3ff', textDecoration:'none'}}>Terms</Link>
          </div>
        </div>

        $2`);
  }
}

// (B) Legal/Support pages (add once, right before Alerts section)
{
  if (!s.includes('function PrivacyPage(')) {
    s = s.replace(
      /\/\/\s*---\s*Alerts\s*\(customer-ready\)\s*---/,
      `// --- Legal & Support pages ---
function PrivacyPage(){
  return (
    <div style={{padding:16, maxWidth:900, margin:'0 auto'}}>
      <h1 style={{marginTop:0}}>Privacy Policy</h1>
      <div style={{opacity:.9, lineHeight:1.6}}>
        We only process your data to provide and improve CyberGuard Pro. We never sell customer data.
        Security: encryption in transit and at rest where supported. Access is audited and least-privilege.
        Contact support@cyberguardpro.io for data requests or questions.
      </div>
    </div>
  );
}
function TermsPage(){
  return (
    <div style={{padding:16, maxWidth:900, margin:'0 auto'}}>
      <h1 style={{marginTop:0}}>Terms of Service</h1>
      <div style={{opacity:.9, lineHeight:1.6}}>
        By using CyberGuard Pro you agree to use it lawfully, keep credentials secure, and accept that
        the service is provided “as is”. Liability is limited to the amount paid in the last 12 months.
        Full terms available on request.
      </div>
    </div>
  );
}
function SupportPage(){
  const email = 'support@cyberguardpro.io';
  return (
    <div style={{padding:16, maxWidth:900, margin:'0 auto'}}>
      <h1 style={{marginTop:0}}>Support</h1>
      <div style={{opacity:.9, marginBottom:12}}>We’re here to help.</div>
      <div style={{display:'grid', gap:10}}>
        <a href={\`mailto:\${email}\`} style={{padding:'10px 12px', border:'1px solid rgba(255,255,255,.2)', borderRadius:10, textDecoration:'none', color:'#e6e9ef'}}>
          Email us at {email}
        </a>
        <Link to="/alerts" style={{padding:'10px 12px', border:'1px solid rgba(255,255,255,.2)', borderRadius:10, textDecoration:'none', color:'#e6e9ef'}}>
          Check recent alerts
        </Link>
        <Link to="/integrations" style={{padding:'10px 12px', border:'1px solid rgba(255,255,255,.2)', borderRadius:10, textDecoration:'none', color:'#e6e9ef'}}>
          Review integrations
        </Link>
      </div>
    </div>
  );
}

// --- Alerts (customer-ready) ---`
    );
  }
}

// (C) Routes for legal/support (insert once before </Routes>)
{
  const routesToAdd = [
    `<Route path="/support" element={protect(<SupportPage/>)} />`,
    `<Route path="/legal/privacy" element={<PrivacyPage/>} />`,
    `<Route path="/legal/terms" element={<TermsPage/>} />`,
  ];
  if (!routesToAdd.every(r => s.includes(r))) {
    s = s.replace(/<\/Routes>/, routesToAdd.join('\n        ') + `\n      </Routes>`);
  }
}

// (D) Dashboard: integration strip loading/retry
{
  // Add connLoading/connErr state next to conn state
  s = s.replace(
    /const \[conn,\s*setConn\] = useState\(\[\]\);(?![\s\S]*const \[connLoading,)/,
    `const [conn, setConn] = useState([]);
  const [connLoading, setConnLoading] = useState(false);
  const [connErr, setConnErr] = useState("");`
  );

  // Harden fetch in the initial load
  s = s.replace(
    /try \{\s*const s = await apiGet\('\/integrations\/status'\);\s*setConn\(s\?\.\items\|\|\[\]\);\s*\}\s*catch\([^)]*\)\s*\{\s*\}/,
    `setConnLoading(true); setConnErr("");
        try { const s = await apiGet('/integrations/status'); setConn(s?.items||[]); }
        catch(e){ setConnErr("Failed to load integration status."); setConn([]); }
        finally { setConnLoading(false); }`
  );

  // Add reloadConn helper inside Dashboard if missing
  if (!s.includes('async function reloadConn()')) {
    s = s.replace(
      /(\n\s*return\s*\()/,
      `

  async function reloadConn(){
    setConnLoading(true); setConnErr("");
    try { const s = await apiGet('/integrations/status'); setConn(s?.items||[]); }
    catch(e){ setConnErr("Failed to load integration status."); }
    finally{ setConnLoading(false); }
  }
$1`
    );
  }

  // Replace IntegrationHealthStrip block with loading/retry UI
  if (s.includes('<IntegrationHealthStrip items={conn} />')) {
    const blockRe = new RegExp(
      String.raw`<div style={{position:'relative', zIndex:1, marginTop:10}}>[.\s\S]*?</div>`,
      'm'
    );
    s = s.replace(blockRe, `
      <div style={{position:'relative', zIndex:1, marginTop:10}}>
        {connLoading ? (
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {Array.from({length:5}).map((_,i)=> (
              <div key={i} style={{padding:'6px 10px',border:'1px solid rgba(255,255,255,.12)',borderRadius:999,background:'rgba(255,255,255,.04)'}}>
                <span style={{opacity:.7}}>Loading…</span>
              </div>
            ))}
          </div>
        ) : connErr ? (
          <div style={{display:'flex',alignItems:'center',gap:8, margin:'6px 0 12px', padding:'8px 10px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:10}}>
            <span>{connErr}</span>
            <button onClick={reloadConn} style={{padding:'6px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'}}>Retry</button>
          </div>
        ) : (
          <>
            <IntegrationHealthStrip items={conn} />
            {Array.isArray(conn) && conn.length===0 && (
              <div style={{margin:'8px 0 12px'}}>
                <EmptyStateFx
                  title="No integrations connected"
                  subtitle="Connect your email, EDR, DNS or cloud to unlock full protection."
                  actionHref="/integrations"
                  actionLabel="Connect integrations"
                />
              </div>
            )}
          </>
        )}
      </div>`.trim());
  }
}

write(MAIN, s);

// -------- package.json: add prebuild guard --------
let pkg = JSON.parse(read(PKG));
pkg.scripts = pkg.scripts || {};
pkg.scripts.prebuild = `node -e "const fs=require('fs');const p='web-ready/src/main.jsx';const s=fs.readFileSync(p,'utf8');const n=(s.match(/ReactDOM\\\\.createRoot\\(/g)||[]).length;if(n!==1){console.error('[prebuild] Expected exactly one ReactDOM.createRoot, found',n);process.exit(1);}if(s.includes('<user__selection>')){console.error('[prebuild] Found stray <user__selection> markers');process.exit(1);}console.log('[prebuild] OK');"`;
write(PKG, JSON.stringify(pkg, null, 2) + '\n');

console.log('✅ Applied legal/support pages, footer, integration loading/retry, and prebuild guard.');
