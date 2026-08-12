import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore.js";

export default function Toast() {
  const message = useAppStore(state => state.toastMessage);
  const token = useAppStore(state => state.toastToken);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!token) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(timer);
  }, [token]);

  return (
    <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{message}</div>
  );
}
