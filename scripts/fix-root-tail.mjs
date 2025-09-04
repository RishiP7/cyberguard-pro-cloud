import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p,'utf8');

const tail = `ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;

const re = /ReactDOM\.createRoot[\s\S]*$/;
s = re.test(s) ? s.replace(re, tail) : (s.trimEnd() + '\n\n' + tail);

// Guard: keep only one createRoot
const hits = (s.match(/ReactDOM\.createRoot/g)||[]).length;
if (hits > 1) s = s.replace(/ReactDOM\.createRoot[\s\S]*$/, tail);

fs.writeFileSync(p, s, 'utf8');
console.log('Root tail normalized.');
