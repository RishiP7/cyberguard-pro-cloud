import fs from 'fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

// ---- Step A: normalize the React root tail (replace from first createRoot to EOF)
const tail =
`ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;

const reTail = /ReactDOM\.createRoot[\s\S]*$/;
if (reTail.test(s)) {
  s = s.replace(reTail, tail);
} else {
  // If somehow missing, just append a clean tail.
  s = s.trimEnd() + '\n\n' + tail;
}

// ---- Step B: auto-close any unbalanced tokens outside of template strings
let inBacktick = false;
let braces = 0, parens = 0, brackets = 0;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  const prev = s[i - 1];

  if (c === '`' && prev !== '\\') inBacktick = !inBacktick;
  if (inBacktick) continue;

  if (c === '{') braces++;
  else if (c === '}') braces--;
  else if (c === '(') parens++;
  else if (c === ')') parens--;
  else if (c === '[') brackets++;
  else if (c === ']') brackets--;
}

let fix = '';
if (inBacktick) fix += '`';
while (braces > 0) { fix += '}'; braces--; }
while (parens > 0) { fix += ')'; parens--; }
while (brackets > 0) { fix += ']'; brackets--; }

if (fix) s = s + '\n' + fix + '\n';

fs.writeFileSync(p, s, 'utf8');
console.log('Tail normalized; appended fix:', JSON.stringify(fix || '(none)'));

// Small report so we see remaining imbalance (should be all zeros)
function balanceReport(txt){
  let t = false, b=0,pn=0,br=0;
  for (let i=0;i<txt.length;i++){
    const c = txt[i], prev = txt[i-1];
    if (c==='`' && prev!=='\\') t=!t;
    if (t) continue;
    if (c==='{') br++; else if (c==='}') br--;
    else if (c==='(') pn++; else if (c===')') pn--;
    else if (c==='[') b++; else if (c===']') b--;
  }
  return { braces: br, parens: pn, brackets: b, inBacktick: t };
}
console.log('Balance after fix:', balanceReport(s));
