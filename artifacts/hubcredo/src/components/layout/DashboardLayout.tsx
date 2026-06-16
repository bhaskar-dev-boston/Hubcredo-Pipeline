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
    <div className="flex min-h-screen" style={{ background: "#05101f", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3" style={{ background: "#040b14", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          <button
            onClick={() => setMobileOpen(true)}
            style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "none", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.6)", cursor: "pointer" }}
            aria-label="Open menu"
          >
            <Menu style={{ width: 18, height: 18 }} />
          </button>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap style={{ width: 14, height: 14, color: "#fff" }} />
            </div>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em" }}>HubCredo</span>
          </Link>
          {balance !== null ? (
            <Link href="/dashboard/billing" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", background: "rgba(79,70,229,.15)", border: "1px solid rgba(79,70,229,.3)", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, color: "#818cf8", textDecoration: "none" }}>
              <Zap style={{ width: 11, height: 11 }} />
              {balance.toLocaleString()}
            </Link>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </header>

        <main className="flex-1 overflow-auto" style={{ background: "#05101f" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
