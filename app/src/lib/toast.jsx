import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // {msg, kind, html}
  const timer = useRef(null);

  const show = useCallback((msg, kind, opts) => {
    clearTimeout(timer.current);
    setToast({ msg, kind, html: opts && opts.html });
    timer.current = setTimeout(() => setToast(null), (opts && opts.ms) || 5500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={"toast" + (toast.kind === "bad" ? " bad" : "")} role="status">
          {toast.html ? <span dangerouslySetInnerHTML={{ __html: toast.msg }} /> : toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
