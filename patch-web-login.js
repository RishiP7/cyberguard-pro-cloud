import fs from 'node:fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// Replace the whole AuthLogin block (up to RequireAuth) with a new one
const re = /function\s+AuthLogin\s*\([\s\S]*?\)\s*\{\s*[\s\S]*?\n\}\s*\nfunction\s+RequireAuth/m;

const API_BASE_SNIPPET = `
  const API_BASE =
    (import.meta?.env?.VITE_API_BASE)
    || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
          ? 'https://cyberguard-pro-cloud.onrender.com'
          : 'http://localhost:8080');
`;

const NEW_BLOCK = `
function AuthLogin(){
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
${API_BASE_SNIPPET}

  async function onSubmit(e){
    e.preventDefault();
    setErr(''); setLoading(true);
    try{
      const r = await fetch(\`\${API_BASE}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { j = { ok:false, error:t }; }
      if (!r.ok || !j.ok || !j.token) throw new Error(j.error || 'login failed');
      if (typeof localStorage !== 'undefined') localStorage.setItem('token', j.token);
      window.location.href = '/';
    } catch(e){
      setErr(e?.message || 'login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{maxWidth:420, margin:'80px auto', padding:20}}>
      <h1>Sign in</h1>
      <p style={{opacity:.8}}>Use your admin email and password.</p>
      <form onSubmit={onSubmit} style={{display:'grid', gap:10}}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          required
          style={{padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.06)', color:'inherit'}}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e=>setPassword(e.target.value)}
          required
          style={{padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.06)', color:'inherit'}}
        />
        <button type="submit" disabled={loading} style={{padding:'10px 12px', borderRadius:8}}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        {err && <div style={{color:'#f99'}}>Error: {err}</div>}
      </form>
    </div>
  );
}
function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
`.trim();

if (!re.test(s)) {
  console.error('Could not locate AuthLogin block to replace. Abort.');
  process.exit(1);
}

s = s.replace(re, NEW_BLOCK + '\n');

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Replaced AuthLogin with email+password login that calls /auth/login and saves JWT.');
} else {
  console.log('ℹ️ No changes made.');
}
