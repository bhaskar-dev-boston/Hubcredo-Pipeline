import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Right-hand 640px slide-over panel. Esc to close. Deep-linkable via URL by the caller. */
export function SlideOver({ open, onClose, title, subtitle, children }: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
          backdropFilter: "blur(2px)", zIndex: 100,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s",
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(640px, 100vw)",
          background: "#fff",
          boxShadow: "-4px 0 32px rgba(0,0,0,.12)",
          zIndex: 101,
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid #E2E8F0",
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0A0A0A", margin: 0, lineHeight: 1.3 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "2px 0 0" }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #E2E8F0", borderRadius: 8, background: "#F5F7FA",
              color: "#64748B", cursor: "pointer", flexShrink: 0, marginLeft: 16,
            }}
            aria-label="Close"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
