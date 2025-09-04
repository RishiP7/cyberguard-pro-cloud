import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');

const tail = `ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DebugOverlay/>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;

const re = /ReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\([\s\S]*$/;
if (re.test(s)) {
  s = s.replace(re, tail);
} else {
  s = s.replace(/\s*$/, '\n\n' + tail);
}
if (!s.endsWith('\n')) s += '\n';
fs.writeFileSync(p, s, 'utf8');
console.log('Render tail normalized.');
