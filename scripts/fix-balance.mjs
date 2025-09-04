import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

let braces=0, parens=0, brackets=0, inTick=false;
for (let i=0;i<s.length;i++){
  const c=s[i], prev=s[i-1];
  if (c==='`' && prev!=='\\') inTick=!inTick;
  if (inTick) continue;
  if (c==='{') braces++; else if (c==='}') braces--;
  else if (c==='(') parens++; else if (c===')') parens--;
  else if (c==='[') brackets++; else if (c===']') brackets--;
}
let fix='';
if (inTick) fix+='`';
while (braces>0){ fix+='}'; braces--; }
while (parens>0){ fix+=')'; parens--; }
while (brackets>0){ fix+=']'; brackets--; }

if (fix) {
  s = s.replace(/\s*$/, '\n') + fix + '\n';
  fs.writeFileSync(p, s, 'utf8');
  console.log('Appended fix tokens:', JSON.stringify(fix));
} else {
  console.log('No structural fixes needed.');
}
