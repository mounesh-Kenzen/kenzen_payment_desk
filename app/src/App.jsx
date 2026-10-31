import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider, useStore } from "./lib/store.jsx";
import { ToastProvider } from "./lib/toast.jsx";
import { DrawerProvider } from "./lib/drawer.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Queue from "./pages/Queue.jsx";
import AllRequests from "./pages/AllRequests.jsx";
import Payments from "./pages/Payments.jsx";
import Payees from "./pages/Payees.jsx";
import Settings from "./pages/Settings.jsx";

function Blocked() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="eyebrow">Kenzen Ventures · Accounts</span>
        <h1>Access removed</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Your account's domain is no longer allowed to use this app. If this is unexpected, contact an admin.
        </p>
      </div>
    </div>
  );
}

function Gate() {
  const { email, blocked } = useStore();
  if (blocked) return <Blocked />;
  if (email === undefined) return <div className="login-wrap"><p className="muted">Loading…</p></div>;
  if (email === null) return <Login />;
  return (
    <DrawerProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Queue />} />
          <Route path="all" element={<AllRequests />} />
          <Route path="pay" element={<Payments />} />
          <Route path="payees" element={<Payees />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DrawerProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </StoreProvider>
  );
}
