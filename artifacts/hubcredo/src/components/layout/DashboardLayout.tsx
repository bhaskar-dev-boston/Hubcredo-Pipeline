import { useState, useEffect } from "react";
import { Menu, Zap } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Link } from "wouter";
import { useCreditStore } from "@/store/creditStore";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { balance, fetchBalance } = useCreditStore();

  useEffect(() => { fetchBalance(); }, []);

  return (
    <div className="flex min-h-screen" style={{ background: "#FFFFFF", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header
  className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3"
  style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(107,78,255,0.12)" }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <button
      onClick={() => setMobileOpen(true)}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: "1px solid rgba(107,78,255,0.15)",
        background: "#F5F3FF",
        color: "#6B4EFF",
        cursor: "pointer",
      }}
      aria-label="Open menu"
    >
      <Menu style={{ width: 18, height: 18 }} />
    </button>

    <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
      <img src="/favicon.svg" alt="HubCredo" style={{ width: 160, height: 44, objectFit: "contain" }} />
    </Link>
  </div>
          {balance !== null ? (
            <Link
              href="/dashboard/billing"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                background: "#F5F3FF",
                border: "1px solid rgba(107,78,255,0.25)",
                borderRadius: 8,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#6B4EFF",
                textDecoration: "none",
              }}
            >
              <Zap style={{ width: 11, height: 11 }} />
              {balance.toLocaleString()}
            </Link>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </header>

        <main className="flex-1 overflow-auto" style={{ background: "#FFFFFF" }}>
          {children}
        </main>
      </div>
    </div>
  );
}