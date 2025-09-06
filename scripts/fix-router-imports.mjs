import fs from "node:fs";

const file = "web-ready/src/main.jsx";
const src = fs.readFileSync(file, "utf8");

// 1) All common exports we may need from react-router-dom
const routerExports = [
  // components
  "BrowserRouter","Routes","Route","Link","NavLink","Outlet","Navigate",
  // hooks
  "useLocation","useNavigate","useParams","useSearchParams","useMatch",
  "useResolvedPath","useHref","useRouteError","useLoaderData",
  // helpers
  "createSearchParams","generatePath"
];

// 2) Gather every identifier already imported anywhere (from any module)
const importAllRE = /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+))(?:\s*,\s*\{([^}]+)\})?\s*from\s*['"][^'"]+['"]/g;
const alreadyImported = new Set();
for (const m of src.matchAll(importAllRE)) {
  // match groups: star-as, {a,b}, default, {c,d} after default
  if (m[1]) alreadyImported.add(m[1]);
  if (m[2]) m[2].split(",").forEach(x => alreadyImported.add(x.trim().split(/\s+as\s+/)[0]));
  if (m[3]) alreadyImported.add(m[3]);
  if (m[4]) m[4].split(",").forEach(x => alreadyImported.add(x.trim().split(/\s+as\s+/)[0]));
}

// 3) Detect router usage in the file (rough heuristic: word-boundary usage)
const used = new Set();
for (const name of routerExports) {
  const re = new RegExp(`\\b${name}\\b`, "m");
  if (re.test(src)) used.add(name);
}

// 4) What’s already imported specifically from react-router-dom?
const rrdImportRE = /import\s*\{([^}]+)\}\s*from\s*['"]react-router-dom['"];?/;
const rrdMatch = src.match(rrdImportRE);
const existingFromRRD = new Set();
if (rrdMatch) {
  rrdMatch[1].split(",").forEach(x => existingFromRRD.add(x.trim().split(/\s+as\s+/)[0]));
}

// 5) Final needed = used − (anything already imported anywhere)
const needed = [...used].filter(n => !alreadyImported.has(n));

// 6) If nothing needed and rrd import exists, we’re done
if (needed.length === 0) {
  console.log("No missing react-router-dom imports detected.");
  process.exit(0);
}

// 7) Build the new specifier list (existingFromRRD ∪ needed), sorted & de-duped
const finalList = Array.from(new Set([...existingFromRRD, ...needed])).sort();

// 8) Write back: replace existing rrd import or insert a new one after the last import
let out;
if (rrdMatch) {
  out = src.replace(rrdImportRE, `import { ${finalList.join(", ")} } from "react-router-dom";`);
} else {
  // find last import line
  const lastImportIdx = [...src.matchAll(/^import .+;?$/gm)].map(m => m.index).pop() ?? 0;
  const insertAt = lastImportIdx === 0 ? 0 : src.indexOf("\n", lastImportIdx) + 1;
  const inject = `import { ${finalList.join(", ")} } from "react-router-dom";\n`;
  out = src.slice(0, insertAt) + inject + src.slice(insertAt);
}

fs.writeFileSync(file, out, "utf8");
console.log(`✅ Updated react-router-dom import with: ${finalList.join(", ")}`);
