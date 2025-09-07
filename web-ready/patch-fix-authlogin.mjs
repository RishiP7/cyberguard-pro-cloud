import fs from "fs";

const P = "web-ready/src/main.jsx";
let s = fs.readFileSync(P, "utf8");
const before = s;

// Ensure react-router-dom has Navigate (harmless if already there)
if (/from ['"]react-router-dom['"]/.test(s)) {
  s = s.replace(
    /import\s*\{\s*([^}]+)\}\s*from\s*['"]react-router-dom['"];/,
    (m, g) => (g.includes("Navigate") ? m : `import { ${g.trim().replace(/\s+/g, " ")}, Navigate } from 'react-router-dom';`)
  );
}

// Replace the entire AuthLogin function body with a clean, balanced version.
const authRe = /function\s+AuthLogin\s*\([\s\S]*?\)\s*\{\s*[\s\S]*?\n\}\s*/;
const authNew = `
function AuthLogin(){
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState('');

  const inp = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.15)",
    background: "rgba(255,255,255,.06)",
    color: "inherit",
    marginBottom: 10
  };
  const btn = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,255,255,.12)",
    cursor: "pointer"
  };

  async function onSubmit(e){
    e.preventDefault();
    setErr('');
    setLoading(true);
    try{
      const res = await fetch(\`\${API_ORIGIN}/auth/admin-login\`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || !data?.token) throw new Error(data?.error || 'login failed');
      if (typeof localStorage !== 'undefined') localStorage.setItem('token', data.token);
      if (typeof window !== 'undefined') window.location.replace('/');
    }catch(e){
      setErr(String(e?.message || e));
    }finally{
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto' }}>
      <h1 style={{ marginBottom: 16 }}>Sign in</h1>
      <form onSubmit={onSubmit}>
        <input style={inp} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" />
        <input style={inp} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" />
        {err && <div style={{ color: '#ff7777', marginBottom: 10 }}>{err}</div>}
        <button style={btn} disabled={loading} type="submit">{loading ? 'Signing in…' : 'Save & Continue'}</button>
      </form>
    </div>
  );
}
`.trim() + "\n";

if (authRe.test(s)) {
  s = s.replace(authRe, authNew);
} else {
  // If the function signature drifted, append our clean one (prevents failed replacement)
  s += "\n" + authNew;
}

// Also fix any accidental brand placeholder we may have left:
// Guarantee the sidebar brand is just the image (no duplicate text).
s = s.replace(/<div[^>]*data-cgp-brand[^>]*>[\s\S]*?<\/div>/, `
  <div data-cgp-brand style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
    <img src="/brand/logo.png" alt="Cyber Guard Pro" style={{height:24,width:"auto"}} />
  </div>
`.trim());

// Make sure we reference PNG (not SVG)
s = s.replace(/\/brand\/logo\.svg/g, "/brand/logo.png");

if (s !== before) {
  fs.writeFileSync(P, s, "utf8");
  console.log("✅ AuthLogin replaced with clean version; brand fixed; Navigate ensured.");
} else {
  console.log("ℹ️ No changes made (file already clean).");
}
