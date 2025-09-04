import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p,'utf8');

// Replace everything from the first ReactDOM.createRoot(...) to EOF
const goodTail = `ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
`;

const re = /ReactDOM\.createRoot[\s\S]*$/;
if (re.test(s)) {
  s = s.replace(re, goodTail);
} else {
  // If not found, just append a correct tail (safe no-op if already present)
  s += '\n' + goodTail;
}

fs.writeFileSync(p, s, 'utf8');
console.log('Restored clean React root render tail.');
