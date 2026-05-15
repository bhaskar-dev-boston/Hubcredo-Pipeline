import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Layers, Settings, LogOut, Zap } from "lucide-react";
import { removeToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "My Leads", icon: Users },
  { href: "/dashboard/stack", label: "My Stack", icon: Layers },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { data: profile } = useGetMe();

  function handleLogout() {
    removeToken();
    setLocation("/login");
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-[#F5F7FA] border-r border-[#E2E8F0] shrink-0">
      <div className="p-6 border-b border-[#E2E8F0]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#2563EB] rounded flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#0A0A0A] tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.25rem", letterSpacing: "0.05em" }}>
            HubCredo
          </span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#EFF6FF] text-[#2563EB]"
                  : "text-[#64748B] hover:text-[#0A0A0A] hover:bg-white"
              }`}
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#E2E8F0]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] text-xs font-bold">
            {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#0A0A0A] truncate">{profile?.full_name || "Founder"}</p>
            <p className="text-xs text-[#64748B] truncate">{profile?.email || ""}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#64748B] hover:text-[#0A0A0A] hover:bg-white rounded-lg transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
