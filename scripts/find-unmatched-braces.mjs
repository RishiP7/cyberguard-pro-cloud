import fs from 'node:fs';

const path = 'web-ready/src/main.jsx';
const src  = fs.readFileSync(path, 'utf8');

// rudimentary parser: tracks {}, (), [] while skipping strings and comments
const stack = [];
let line = 1, col = 0;
let i = 0;
let inSL = false, inML = false, inSQ = false, inDQ = false, inBT = false, btDepth = 0;

function push(ch){ stack.push({ch, line, col, i}); }
function pop(expect){
  for(let j=stack.length-1;j>=0;j--){
    if(stack[j].ch === expect){ stack.splice(j,1); return true; }
  }
  return false;
}

while (i < src.length) {
  const c = src[i];
  const n = src[i+1];
  col++;

  // newline bookkeeping
  if (c === '\n') { line++; col = 0; inSL = false; i++; continue; }

  // handle // and /* */ comments (only when not in string/template)
  if (!inSQ && !inDQ && !inBT) {
    if (!inML && c === '/' && n === '/') { inSL = true; i+=2; col++; continue; }
    if (!inSL && c === '/' && n === '*') { inML = true; i+=2; col++; continue; }
    if (inML && c === '*' && n === '/') { inML = false; i+=2; col++; continue; }
  }
  if (inSL || inML) { i++; continue; }

  // strings / templates
  if (!inDQ && !inBT && c === "'" && src[i-1] !== '\\') { inSQ = !inSQ; i++; continue; }
  if (!inSQ && !inBT && c === '"' && src[i-1] !== '\\') { inDQ = !inDQ; i++; continue; }
  if (!inSQ && !inDQ && c === '`' && src[i-1] !== '\\') { 
    inBT = !inBT; 
    if (inBT) btDepth = 0;
    i++; continue; 
  }
  // inside template literal: allow ${ ... } nesting without leaving backticks
  if (inBT) {
    if (c === '{' && src[i-1] === '$') { btDepth++; push('{'); i++; continue; }
    if (c === '}' && btDepth > 0) { btDepth--; pop('{'); i++; continue; }
    i++; continue;
  }
  // inside plain string
  if (inSQ || inDQ) { i++; continue; }

  // track brackets
  if (c === '{') push('{');
  else if (c === '}') {
    const ok = pop('{');
    if (!ok) {
      console.log(`Extra closing } at ${line}:${col}`);
    }
  } else if (c === '(') push('(');
  else if (c === ')') pop('(');
  else if (c === '[') push('[');
  else if (c === ']') pop('[');

  i++;
}

// report leftovers
const opens = stack.filter(x => x.ch === '{');
if (opens.length) {
  console.log(`\nUnclosed { count: ${opens.length}`);
  for (const o of opens.slice(-10)) {
    const snippet = src.slice(o.i, o.i + 120).split('\n')[0];
    console.log(`- Opened at ${o.line}:${o.col} — “…${snippet.replace(/\s+/g,' ').slice(0,100)}…”`);
  }
  process.exit(1);
} else {
  console.log('All curly braces balanced ✅');
}
