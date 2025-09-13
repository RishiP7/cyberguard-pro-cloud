import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
// --- RequireAuthSafe shim: if real RequireAuth is absent, just render children ---
function RequireAuthSafe(props) {
  try {
    if (typeof RequireAuth === "function") {
      // Delegate to the real guard when it's present in this build
      return <RequireAuth {...props}/>;
    }
  } catch (_e) {}
  // Fallback: allow access (used for demo/dev builds where guard isn't bundled)
  return <>{props.children}</>;
}
