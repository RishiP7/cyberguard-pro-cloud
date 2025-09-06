import fs from "node:fs";

const p = "app/src/index.js";
let s = fs.readFileSync(p, "utf8");
let changed = false;

/**
 * Insert optionsSuccessStatus: 204 into app.use(cors({...}))
 * We find 'app.use(cors({', then walk braces to the matching '})' and inject if missing.
 */
function patchGlobalCors(src){
  const needle = "app.use(cors({";
  const i = src.indexOf(needle);
  if (i === -1) return src;

  const startObj = src.indexOf("{", i + "app.use(cors(".length);
  if (startObj === -1) return src;

  // walk braces to find matching closing }
  let j = startObj, depth = 0;
  for (; j < src.length; j++){
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return src; // malformed, bail

  const objBody = src.slice(startObj + 1, j); // without outer {}
  if (/optionsSuccessStatus\s*:\s*204/.test(objBody)) {
    return src; // already has it
  }

  // Place before closing }. Add a comma if needed.
  const trimmed = objBody.trimEnd();
  const needsComma = !trimmed.endsWith(",") && trimmed.length > 0;
  const insert = (needsComma ? ",\n  " : "\n  ") + "optionsSuccessStatus: 204\n";
  const newBody = objBody + insert;

  const out = src.slice(0, startObj + 1) + newBody + src.slice(j);
  changed = true;
  return out;
}

/**
 * Remove explicit preflight block that starts with a comment line `// Preflight`
 * and the following `app.options(...);` call (properly counting parens).
 */
function removePreflight(src){
  const cmt = "\n// Preflight";
  const k = src.indexOf(cmt);
  if (k === -1) return src;

  const callStart = src.indexOf("app.options(", k);
  if (callStart === -1) return src;

  // walk parentheses for app.options(
  let openIdx = src.indexOf("(", callStart);
  if (openIdx === -1) return src;
  let depth = 0, pos = openIdx;
  for (; pos < src.length; pos++){
    const ch = src[pos];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) { pos++; break; } // pos now right after ')'
    }
  }
  // expect trailing semicolon & maybe newline
  while (pos < src.length && /\s/.test(src[pos])) pos++;
  if (src[pos] === ";") pos++;

  // Remove from the comment to the end of the call
  const out = src.slice(0, k) + "\n" + src.slice(pos);
  changed = true;
  return out;
}

s = patchGlobalCors(s);
s = removePreflight(s);

if (changed) {
  fs.writeFileSync(p, s, "utf8");
  console.log("✅ Fixed: added optionsSuccessStatus and removed explicit preflight handler.");
} else {
  console.log("ℹ️ No changes needed.");
}
