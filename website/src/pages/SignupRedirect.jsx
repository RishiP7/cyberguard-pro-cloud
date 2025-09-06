import { useEffect } from "react";

export default function SignupRedirect(){
  useEffect(() => {
    const qs = window.location.search || "";
    const to = `/register${qs}`;
    const app = (import.meta?.env?.VITE_APP_URL) || "https://app.yourdomain.com";
    window.location.replace(`${app}${to}`);
  }, []);
  return null;
}
