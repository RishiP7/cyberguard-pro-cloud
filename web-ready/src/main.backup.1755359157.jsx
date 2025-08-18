import React from "react";
import ReactDOM from "react-dom/client";

function App(){
  return (
    <div style={{padding:24}}>
      <h2>Minimal React OK ✅</h2>
      <p>If you can see this, React renders fine.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><App/></React.StrictMode>
);
