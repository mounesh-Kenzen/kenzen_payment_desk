import React, { useEffect } from "react";
import { useDrawer } from "../lib/drawer.jsx";
import RequestDetail from "./RequestDetail.jsx";
import RequestForm from "./RequestForm.jsx";
import PayeeForm from "./PayeeForm.jsx";

export default function Drawer() {
  const { drawer, close } = useDrawer();

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && drawer) close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, close]);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawer]);

  if (!drawer) return null;

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="drawer" aria-modal="true" role="dialog">
        {drawer.mode === "detail" && <RequestDetail state={drawer} />}
        {drawer.mode === "form" && <RequestForm state={drawer} />}
        {drawer.mode === "payee" && <PayeeForm state={drawer} />}
      </aside>
    </>
  );
}
