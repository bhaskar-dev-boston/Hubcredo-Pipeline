import { useState, useEffect } from "react";
import { Menu, Zap } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Link } from "wouter";
import { useCreditStore } from "@/store/creditStore";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DESKTOP_BREAKPOINT = 1024;

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { balance, fetchBalance } = useCreditStore();
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= DESKTOP_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= DESKTOP_BREAKPOINT);

  useEffect(() => { fetchBalance(); }, []);

  useEffect(() => {
    const handler = () => {
      const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      setIsDesktop(desktop);
      // auto-open on resize to desktop, auto-close on resize to mobile
      setSidebarOpen(desktop);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar
        open={sidebarOpen}
        isDesktop={isDesktop}
        onClose={() => setSidebarOpen(false)}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar — always visible, contains hamburger */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "#FFFFFF", borderBottom: "1px solid rgba(107,78,255,0.12)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, border: "1px solid rgba(107,78,255,0.15)",
                background: "#F5F3FF", color: "#6B4EFF", cursor: "pointer", flexShrink: 0,
              }}
              aria-label="Toggle menu"
            >
              <Menu style={{ width: 18, height: 18 }} />
            </button>

            {/* Show logo in header only when sidebar is closed */}
            {!sidebarOpen && (
              <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
                <img src="/favicon.svg" alt="HubCredo" style={{ width: 120, height: 36, objectFit: "contain" }} />
              </Link>
            )}
          </div>

          {balance !== null ? (
            <Link
              href="/dashboard/billing"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 10px", background: "#F5F3FF",
                border: "1px solid rgba(107,78,255,0.25)", borderRadius: 8,
                fontSize: "0.75rem", fontWeight: 600, color: "#6B4EFF", textDecoration: "none",
              }}
            >
              <Zap style={{ width: 11, height: 11 }} />
              {balance.toLocaleString()}
            </Link>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </header>

        <main style={{ flex: 1, overflowY: "auto", background: "#FFFFFF" }}>
          {children}
        </main>
      </div>
    </div>
  );
}