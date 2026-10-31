import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { mergeSettings, makeCtx } from "../../shared/logic.js";

const StoreContext = createContext(null);
const SETTINGS_CACHE_KEY = "kpd_settings_cache_v1";

// Settings (tier limit, cost centres, nature-of-payment master, role lists,
// display names) change rarely and aren't sensitive the way payee bank
// details or request amounts are, so they're the one thing cached in the
// browser: it lets dropdowns and the settings screen render instantly on
// reload instead of flashing empty while /api/state is in flight. Requests
// and payees are never cached client-side — they always come fresh from the
// server.
function readSettingsCache() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSettingsCache(settings, natures) {
  try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ settings, natures })); } catch { /* private mode / quota: skip */ }
}

export function StoreProvider({ children }) {
  const [email, setEmail] = useState(undefined); // undefined = unknown yet, null = signed out
  const [raw, setRaw] = useState(null); // last /api/state payload
  const [cached] = useState(readSettingsCache);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineMsg, setOfflineMsg] = useState("");
  const refreshing = useRef(false);

  const checkSession = useCallback(async () => {
    try {
      const { email } = await api.me();
      setEmail(email || null);
    } catch {
      setEmail(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const st = await api.state();
      setRaw(st);
      setLoaded(true);
      setOffline(false);
      writeSettingsCache(st.settings, st.natures);
    } catch (e) {
      if (!loaded) { setOffline(true); setOfflineMsg(e.message); }
    } finally {
      refreshing.current = false;
    }
  }, [loaded]);

  useEffect(() => { checkSession(); }, [checkSession]);

  useEffect(() => {
    if (!email) return;
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const settings = raw
    ? mergeSettings(raw.settings, raw.natures)
    : cached ? mergeSettings(cached.settings, cached.natures) : mergeSettings(null, null);
  const ctx = makeCtx({
    settings,
    payees: raw ? raw.payees : [],
    requests: raw ? raw.requests.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [],
    me: { id: raw ? raw.me.id : email || null },
    isAdmin: raw ? raw.me.isAdmin : false,
  });
  const owner = raw ? raw.me.owner : "";
  const sheetUrl = "";

  const value = {
    email, setEmail, loaded, offline, offlineMsg, refresh, ctx, owner, sheetUrl,
    names: settings.names,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}

export function useName() {
  const { names, ctx } = useStore();
  return (id) => {
    if (!id) return "Someone";
    const n = names[id];
    const base = n || id.split("@")[0];
    return id === ctx.me.id ? base + " (you)" : base;
  };
}
