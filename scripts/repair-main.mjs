import fs from 'fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

// --- (A) Deduplicate ReactDOM import; keep one at top ---
const importLine = 'import ReactDOM from "react-dom/client";';
{
  const lines = s.split(/\r?\n/);
  let saw = false;
  const kept = [];
  for (const line of lines) {
    if (line.trim() === importLine) {
      if (!saw) { kept.push(line); saw = true; }
      // else drop duplicates
    } else {
      kept.push(line);
    }
  }
  s = kept.join('\n');
  if (!s.startsWith(importLine)) s = importLine + '\n' + s;
}

// --- (B) Normalize the final render tail (from first createRoot to EOF) ---
const renderNeedle = 'ReactDOM.createRoot(document.getElementById("root")).render(';
const goodTail =
`ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DebugOverlay/>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;
{
  const re = /ReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\([\s\S]*$/;
  if (re.test(s)) {
    s = s.replace(re, goodTail);
  } else {
    // If for some reason it's missing, append a clean tail
    s = s.replace(/\s*$/, '\n') + goodTail;
  }
}

// --- (C) Auto-balance tokens outside template literals ---
{
  let braces = 0, parens = 0, brackets = 0, inTick = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const prev = s[i - 1];

    // Track template literal backticks (ignore escaped \`)
    if (c === '`' && prev !== '\\') inTick = !inTick;

    if (!inTick) {
      if (c === '{') braces++;
      else if (c === '}') braces--;
      else if (c === '(') parens++;
      else if (c === ')') parens--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
    }
    i++;
  }

  let fix = '';
  if (inTick) fix += '`';
  while (braces > 0) { fix += '}'; braces--; }
  while (parens > 0) { fix += ')'; parens--; }
  while (brackets > 0) { fix += ']'; brackets--; }

  if (fix) s = s.replace(/\s*$/, '\n') + fix + '\n';
}

// --- (D) Warn if block comments are unbalanced (/* … */)
{
  const opens = (s.match(/\/\*/g) || []).length;
  const closes = (s.match(/\*\//g) || []).length;
  if (opens !== closes) {
    console.warn(`WARNING: Unbalanced block comments: opens=${opens}, closes=${closes}`);
    // We do NOT try to auto-fix comments; just warn.
  }
}

// Ensure newline at EOF
if (!s.endsWith('\n')) s += '\n';

fs.writeFileSync(p, s, 'utf8');
console.log('✅ Repaired main.jsx: dedup import, normalized render tail, balanced tokens.');
