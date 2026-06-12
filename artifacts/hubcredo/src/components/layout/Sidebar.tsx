import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Layers, Settings, LogOut, Zap, X, Globe, CreditCard, Mail, Inbox, Linkedin, Building2 } from "lucide-react";
import { removeToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { useCreditStore } from "@/store/creditStore";
import { useEffect } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "My Leads", icon: Users },
  { href: "/dashboard/linkedin", label: "LinkedIn Outreach", icon: Linkedin },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Mail },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/stack", label: "My Stack", icon: Layers },
  { href: "/dashboard/domains", label: "Domain Finder", icon: Globe },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { data: profile } = useGetMe();
  const { balance, fetchBalance } = useCreditStore();

  useEffect(() => {
    fetchBalance();
  }, []);

  function handleLogout() {
    removeToken();
    setLocation("/login");
  }

  const initials =
    profile?.full_name
      ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
      : profile?.email?.[0]?.toUpperCase() ?? "U";

  const isCrmActive = location === "/dashboard/crm" || location.startsWith("/dashboard/crm");

  const sidebarContent = (
    <aside className="flex flex-col w-64 h-full bg-white border-r border-[#E2E8F0]">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#E2E8F0]">
        <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
          <div className="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center shadow-[0_2px_8px_rgba(37,99,235,0.35)]">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <span
            className="text-[#0A0A0A] tracking-widest"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", letterSpacing: "0.08em" }}
          >
            HubCredo
          </span>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F5F7FA] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Credit balance pill */}
      {balance !== null && (
        <div className="mx-3 mt-3">
          <Link href="/dashboard/billing" onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl hover:bg-[#DBEAFE] transition-colors">
            <Zap className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span className="text-xs font-semibold text-[#2563EB]">{balance.toLocaleString()} credits</span>
            <span className="ml-auto text-[10px] text-[#93C5FD]">Top up →</span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-widest px-3 pb-2 pt-1">Navigation</p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-[#2563EB] text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)]"
                  : "text-[#64748B] hover:text-[#0A0A0A] hover:bg-[#F5F7FA]"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 transition-transform duration-150 ${isActive ? "" : "group-hover:scale-110"}`} />
              {label}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
              )}
            </Link>
          );
        })}

        {/* Integrations section */}
        <div className="pt-3 pb-1">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-widest px-3 pb-2">Integrations</p>

          {/* CRM nav item */}
          <Link
            href="/dashboard/crm"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group mb-0.5 ${
              isCrmActive
                ? "bg-[#2563EB] text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)]"
                : "text-[#64748B] hover:text-[#0A0A0A] hover:bg-[#F5F7FA]"
            }`}
          >
            <Building2 className={`w-4 h-4 shrink-0 transition-transform duration-150 ${isCrmActive ? "" : "group-hover:scale-110"}`} />
            CRM
            {isCrmActive && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
            )}
            {!isCrmActive && (
              <span className="ml-auto text-[10px] text-[#94A3B8]">Attio</span>
            )}
          </Link>

        </div>
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-[#E2E8F0] bg-[#F5F7FA]/50">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] truncate leading-tight">{profile?.full_name || "Founder"}</p>
            <p className="text-xs text-[#64748B] truncate">{profile?.email || ""}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex flex-col w-64 min-h-screen shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — slide-in drawer */}
      <>
        <div
          className={`lg:hidden fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={onClose}
        />
        <div
          className={`lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 shadow-2xl transition-transform duration-300 ease-in-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </div>
      </>
    </>
  );
}