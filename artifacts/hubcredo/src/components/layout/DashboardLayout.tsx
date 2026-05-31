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
    <div className="flex min-h-screen bg-[#F5F7FA]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0] shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F5F7FA] hover:text-[#0A0A0A] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#2563EB] rounded-lg flex items-center justify-center shadow-[0_2px_6px_rgba(37,99,235,0.3)]">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span
              className="text-[#0A0A0A]"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.2rem", letterSpacing: "0.08em" }}
            >
              HubCredo
            </span>
          </Link>
          {/* Credit balance on mobile header */}
          {balance !== null ? (
            <Link href="/dashboard/billing"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-xs font-semibold text-[#2563EB]">
              <Zap className="w-3 h-3" />
              {balance.toLocaleString()}
            </Link>
          ) : (
            <div className="w-9" />
          )}
        </header>

        <main className="flex-1 overflow-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
