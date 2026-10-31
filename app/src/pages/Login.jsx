import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useStore } from "../lib/store.jsx";

export default function Login() {
  const btnRef = useRef(null);
  const { setEmail } = useStore();
  const [err, setErr] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !window.google || !btnRef.current) return;
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
