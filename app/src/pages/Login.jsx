import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useStore } from "../lib/store.jsx";

export default function Login() {
  const btnRef = useRef(null);
  const { setEmail } = useStore();
  const [err, setErr] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    function init() {
      if (cancelled || !btnRef.current || !window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            const r = await api.authGoogle(resp.credential);
            setEmail(r.email);
          } catch (e) {
            setErr(e.message);
          }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current, { theme: "outline", size: "large", width: 280 });
      return true;
    }

    // The Identity Services script loads async/defer in index.html, so it
    // may not be ready yet when this component mounts — poll briefly instead
    // of giving up after a single check.
    if (!init()) {
      const t = setInterval(() => { if (init()) clearInterval(t); }, 150);
      return () => { cancelled = true; clearInterval(t); };
    }
    return () => { cancelled = true; };
  }, [clientId, setEmail]);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="eyebrow">Kenzen Ventures · Accounts</span>
        <h1>Payment Desk</h1>
        <p className="muted small" style={{ margin: 0 }}>Sign in with your Kenzen Google Workspace account to raise, approve or pay requests.</p>
        {clientId ? <div ref={btnRef} /> : <p className="err">Google sign-in isn't configured yet (missing VITE_GOOGLE_CLIENT_ID).</p>}
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
