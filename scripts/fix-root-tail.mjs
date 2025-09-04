import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p,'utf8');

// Known-good tail
const tail = `ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;

// Replace anything from the first createRoot to EOF with the good tail
const re = /ReactDOM\.createRoot[\s\S]*$/;
if (re.test(s)) s = s.replace(re, tail); else s = s.trimEnd() + '\n\n' + tail;

// Safety: if multiple createRoot exist, keep only the last good tail
const hits = (s.match(/ReactDOM\.createRoot/g)||[]).length;
if (hits > 1) {
  const head = s.split(/ReactDOM\.createRoot[\s\S]*$/)[0];
  s = head + tail;
}

fs.writeFileSync(p, s, 'utf8');
console.log('Root tail normalized.');
