ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DebugOverlay/>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);

import { useLocation } from 'react-router-dom';
