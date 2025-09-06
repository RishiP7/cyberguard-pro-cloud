const fs=require('fs');const p='web-ready/src/main.jsx';const s=fs.readFileSync(p,'utf8');
function count(re){return (s.match(re)||[]).length;}
const report=[
  ['open divs', count(/<div\b/g)],
  ['close </div>', count(/<\/div>/g)],
  ['fragments <>', count(/<>/g)],
  ['frag close </>', count(/<\/>/g)],
  ['{', count(/\{/g)], ['}', count(/\}/g)],
  ['(', count(/\(/g)], [')', count(/\)/g)],
  ['Quick AI markers', count(/\{\s*\/\*\s*Quick AI ask\s*\*\/\s*\}/g)],
];
console.log('== JSX sanity ==');
for (const [k,v] of report) console.log(k.padEnd(16), v);
console.log('\nNearby Quick AI region:');
const qi = s.indexOf('{/* Quick AI ask */}');
if(qi!==-1){console.log(s.slice(Math.max(0,qi-300), qi+400));}
