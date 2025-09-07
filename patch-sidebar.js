import fs from "node:fs";

const p = "web-ready/src/main.jsx";
let s = fs.readFileSync(p, "utf8");
const before = s;

/* ---------- A) Ensure react-router-dom import includes NavLink ---------- */
{
  const re = /import\s*\{[^}]*\}\s*from\s*["']react-router-dom["'];?/;
  const want = `import { BrowserRouter, Routes, Route, Link, NavLink, Navigate } from "react-router-dom";`;
  if (re.test(s)) {
    s = s.replace(re, want);
  } else {
    // insert right after the first React import
    const reReact = /import\s+React[^;\n]*;\s*/;
    if (reReact.test(s)) {
      s = s.replace(reReact, m => m + "\n" + want + "\n");
    } else {
      // fallback: prepend
      s = want + "\n" + s;
    }
  }
}

/* ---------- B) Replace Layout(...) with sidebar version ---------- */
{
  const layoutStart = s.search(/function\s+Layout\s*\(/);
  if (layoutStart !== -1) {
    // naive function block match: find matching closing "}\n" by scanning braces
    let i = layoutStart;
    // move to first "{"
    i = s.indexOf("{", i);
    if (i !== -1) {
      let depth = 0, end = -1;
      for (let j = i; j < s.length; j++) {
        const ch = s[j];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }
      if (end !== -1) {
        const head = s.slice(0, layoutStart);
        const tail = s.slice(end + 1); // after the closing brace

        const newLayout = `
function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#090b10', color: '#e6e9ef' }}>
      {/* Sidebar */}
      <div
        style={{
          width: 232,
          background: 'rgba(8,10,14,0.95)',
          borderRight: '1px solid rgba(255,255,255,.12)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'sticky',
          top: 0,
          height: '100vh'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Cyber <span style={{ color: '#7bd88f' }}>Guard</span> Pro
        </h2>

        <style>{\`
          .side-link {
            display: inline-block;
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,.12);
            text-decoration: none;
            color: #e6e9ef;
            background: rgba(255,255,255,.03);
            transition: all .18s ease;
          }
          .side-link:hover {
            box-shadow: 0 0 18px rgba(47,161,255,.35), inset 0 0 10px rgba(123,216,143,.12);
            border-color: rgba(123,216,143,.45);
            transform: translateX(2px);
          }
          .side-link.active {
            background: linear-gradient(90deg, rgba(37,161,255,.18), rgba(123,216,143,.18));
            border-color: rgba(37,161,255,.55);
          }
        \`}</style>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NavLink to="/"              className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Dashboard</NavLink>
          <NavLink to="/alerts"        className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Alerts</NavLink>
          <NavLink to="/integrations"  className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Integrations</NavLink>
          <NavLink to="/autonomy"      className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Autonomy</NavLink>
          <NavLink to="/policy"        className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Policy</NavLink>
          <NavLink to="/pricing"       className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Pricing</NavLink>
          <NavLink to="/account"       className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Account</NavLink>
          <NavLink to="/admin"         className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Admin</NavLink>
          <NavLink to="/admin/console" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Admin Console</NavLink>
          <NavLink to="/support"       className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Support</NavLink>
          <NavLink to="/test"          className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>Test</NavLink>
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
`.trim();

        s = head + newLayout + "\n" + tail;
      }
    }
  }
}

if (s !== before) {
  fs.writeFileSync(p, s, "utf8");
  console.log("✅ Patched main.jsx (router import + sidebar Layout).");
} else {
  console.log("ℹ️ No changes detected; file may already be patched.");
}
