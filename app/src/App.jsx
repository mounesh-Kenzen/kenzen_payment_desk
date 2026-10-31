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

function Gate() {
  const { email } = useStore();
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
