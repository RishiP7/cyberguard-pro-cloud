const fs=require('fs'), p='web-ready/src/main.jsx';
let s=fs.readFileSync(p,'utf8');

const start = s.indexOf("<div style={{position:'relative', zIndex:1, marginTop:10}}>");
const marker = s.indexOf('{/* Quick AI ask */}');

if (start===-1 || marker===-1 || marker<=start) {
  console.error('❌ Expected Integration-start and Quick-AI markers not found (or out of order).');
  process.exit(1);
}

const block = `<div style={{position:'relative', zIndex:1, marginTop:10}}>
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
</div>

`;

const out = s.slice(0, start) + block + s.slice(marker);
fs.writeFileSync(p, out, 'utf8');
console.log('✅ Rewrote Integration block cleanly.');
