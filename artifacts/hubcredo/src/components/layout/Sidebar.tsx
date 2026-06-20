import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Layers, Settings, LogOut, Zap, X, Globe, CreditCard, Mail, Inbox, Linkedin, Building2, Sparkles, ShoppingCart} from "lucide-react";
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
  { href: "/dashboard/tools", label: "Recommended Tools", icon: Sparkles },
  
  { href: "/dashboard/domains", label: "Domain Finder", icon: Globe },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const secondaryNavItems = [
  { href:"/dashboard/replyio",label: "Reply.io Outreach", icon: Users },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
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
    <aside style={{ display: "flex", flexDirection: "column", width: 256, height: "100%", background: "#FFFFFF", borderRight: "1px solid rgba(107,78,255,.12)", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px", borderBottom: "1px solid rgba(107,78,255,.12)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }} onClick={onClose}>
  <img src="/favicon.svg" alt="HubCredo" style={{ width: 70, height: 30, objectFit: "contain", flexShrink: 0 }} />
  <span style={{ color: "#1E1B4B", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.02em" }}>HubCredo</span>
</Link>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: "#9CA3AF", cursor: "pointer" }}
          className="lg:hidden"
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Credit balance pill */}
      {balance !== null && (
        <div style={{ margin: "12px 12px 0" }}>
          <Link href="/dashboard/billing" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F5F3FF", border: "1px solid rgba(107,78,255,.2)", borderRadius: 12, textDecoration: "none" }}>
            <Zap style={{ width: 14, height: 14, color: "#6B4EFF", flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6B4EFF" }}>{balance.toLocaleString()} credits</span>
            <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "#8B7CF6" }}>Top up →</span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".12em", padding: "4px 12px 8px" }}>Navigation</p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 12px",
                borderRadius: 10,
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "all 0.15s",
                color: isActive ? "#fff" : "#6B7280",
                background: isActive ? "#6B4EFF" : "transparent",
                boxShadow: isActive ? "0 2px 8px rgba(107,78,255,.3)" : "none",
              }}
              onMouseOver={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "#F5F3FF"; (e.currentTarget as HTMLElement).style.color = "#1E1B4B"; }}}
              onMouseOut={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6B7280"; }}}
            >
              <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
              {label}
              {isActive && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.6)" }} />}
            </Link>
          );
        })}

        {/* Integrations section */}
        <div style={{ paddingTop: 12 }}>
          <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".12em", padding: "0 12px 8px" }}>Integrations</p>
          <Link
            href="/dashboard/crm"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              borderRadius: 10,
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
              transition: "all 0.15s",
              color: isCrmActive ? "#fff" : "#6B7280",
              background: isCrmActive ? "#6B4EFF" : "transparent",
              boxShadow: isCrmActive ? "0 2px 8px rgba(107,78,255,.3)" : "none",
            }}
            onMouseOver={e => { if (!isCrmActive) { (e.currentTarget as HTMLElement).style.background = "#F5F3FF"; (e.currentTarget as HTMLElement).style.color = "#1E1B4B"; }}}
            onMouseOut={e => { if (!isCrmActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6B7280"; }}}
          >
            <Building2 style={{ width: 16, height: 16, flexShrink: 0 }} />
            CRM
            {isCrmActive
              ? <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.6)" }} />
              : <span style={{ marginLeft: "auto", fontSize: "0.625rem", color: "#9CA3AF" }}>Attio</span>
            }
          </Link>
        </div>

        {/* Billing */}
        <div style={{ paddingTop: 4 }}>
          {secondaryNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 12px",
                  borderRadius: 10,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "all 0.15s",
                  color: isActive ? "#fff" : "#6B7280",
                  background: isActive ? "#6B4EFF" : "transparent",
                  boxShadow: isActive ? "0 2px 8px rgba(107,78,255,.3)" : "none",
                }}
                onMouseOver={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "#F5F3FF"; (e.currentTarget as HTMLElement).style.color = "#1E1B4B"; }}}
                onMouseOut={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#6B7280"; }}}
              >
                <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                {label}
                {isActive && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.6)" }} />}
              </Link>
            );
          })}
        </div>

        {/* Pay for Tools CTA */}
        <div style={{ paddingTop: 8 }}>
          <Link
            href="/dashboard/tools"
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, borderRadius: 10, boxShadow: "0 2px 8px rgba(107,78,255,.35)" }}
          >
            <ShoppingCart style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>Pay for Tools</span>
            <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "rgba(255,255,255,.75)" }}>5 tools →</span>
          </Link>
        </div>
      </nav>

      {/* User footer */}
      <div style={{ padding: 12, borderTop: "1px solid rgba(107,78,255,.12)", background: "#F5F3FF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 6px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1E1B4B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{profile?.full_name || "Founder"}</p>
            <p style={{ fontSize: "0.75rem", color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email || ""}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          data-testid="button-logout"
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", border: "none", background: "transparent", fontSize: "0.875rem", color: "#6B7280", cursor: "pointer", borderRadius: 10, transition: "all .15s" }}
          onMouseOver={e => { e.currentTarget.style.background = "rgba(239,68,68,.08)"; e.currentTarget.style.color = "#dc2626"; }}
          onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B7280"; }}
        >
          <LogOut style={{ width: 16, height: 16 }} />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-64 min-h-screen shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile sidebar drawer */}
      <>
        <div
          className={`lg:hidden fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          onClick={onClose}
        />
        <div
          className={`lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 shadow-2xl transition-transform duration-300 ease-in-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          {sidebarContent}
        </div>
      </>
    </>
  );
}