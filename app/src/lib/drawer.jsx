import React, { createContext, useContext, useState } from "react";

const DrawerContext = createContext(null);

export function DrawerProvider({ children }) {
  const [drawer, setDrawer] = useState(null);
  const close = () => setDrawer(null);
  const open = (state) => setDrawer(state);
  return <DrawerContext.Provider value={{ drawer, open, close, setDrawer }}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  const v = useContext(DrawerContext);
  if (!v) throw new Error("useDrawer must be used inside DrawerProvider");
  return v;
}
