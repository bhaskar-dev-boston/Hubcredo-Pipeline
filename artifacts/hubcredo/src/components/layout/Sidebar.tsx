import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Settings, LogOut, Zap, X, Globe, CreditCard, Mail,
  Inbox, Linkedin, Building2, Sparkles, ShoppingCart, Phone, Target,
  Briefcase, UserCheck, Megaphone, ChevronRight,
} from "lucide-react";
import { removeToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { useCreditStore } from "@/store/creditStore";
import { useEffect } from "react";

// ── Sales nav (unchanged) ──────────────────────────────────────────────────────
const salesNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "My Leads", icon: Users },
  { href: "/dashboard/get-icp", label: "ICP Finder", icon: Target },
  { href: "/dashboard/linkedin", label: "LinkedIn Outreach", icon: Linkedin },
  { href: "/dashboard/cold-calling", label: "Cold Calling", icon: Phone },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Mail },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/tools", label: "Recommended Tools", icon: Sparkles },
  { href: "/dashboard/domains", label: "Domain Finder", icon: Globe },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const secondaryNavItems = [
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

// ── Recruit nav ────────────────────────────────────────────────────────────────
const recruitNavItems = [
  { href: "/dashboard/recruit", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/recruit/clients", label: "Clients", icon: Building2 },
  { href: "/dashboard/recruit/roles", label: "Roles", icon: Briefcase },
  { href: "/dashboard/recruit/candidates", label: "Candidates", icon: UserCheck },
  { href: "/dashboard/recruit/outreach", label: "Outreach", icon: Megaphone },
  { href: "/dashboard/recruit/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/recruit/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  isDesktop: boolean;
  onClose: () => void;
}

export function Sidebar({ open, isDesktop, onClose }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { data: profile } = useGetMe();
  const { balance, fetchBalance } = useCreditStore();

  useEffect(() => { fetchBalance(); }, []);

  function handleLogout() {
    removeToken();
    setLocation("/login");
  }

  function handleWorkspaceSwitch() {
    if (!isDesktop) onClose();
    const currentIsRecruit = location === "/dashboard/recruit" || location.startsWith("/dashboard/recruit/") || location.startsWith("/dashboard/recruit?");
    if (currentIsRecruit) {
      setLocation("/dashboard");
    } else {
      setLocation("/dashboard/recruit");
    }
  }

  const initials =
    profile?.full_name
      ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
      : profile?.email?.[0]?.toUpperCase() ?? "U";

  // FIX: derive isRecruit from the current route, not profile.workspace_type.
  // The workspace-switch button below already navigates by route
  // (location.startsWith("/dashboard/recruit")) without waiting on any
  // profile mutation/refetch — so the nav list needs to follow the same
  // signal, or it can show the wrong items even while the correct
  // dashboard content is rendering at the URL. This also makes the
  // sidebar immune to workspace_type ever failing to sync on the backend.
  const isRecruit = location.startsWith("/dashboard/recruit");

  const isCrmActive = location === "/dashboard/crm" || location.startsWith("/dashboard/crm");

  const navLink = (href: string, label: string, Icon: any, isActive: boolean, badge?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      onClick={() => { if (!isDesktop) onClose(); }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
        borderRadius: 10, fontSize: "0.875rem", fontWeight: 500, textDecoration: "none",
        transition: "all 0.15s",
        color: isActive ? "#fff" : "#6B7280",
        background: isActive ? (isRecruit ? "#2563EB" : "#6B4EFF") : "transparent",
        boxShadow: isActive ? (isRecruit ? "0 2px 8px rgba(37,99,235,.3)" : "0 2px 8px rgba(107,78,255,.3)") : "none",
      }}
      onMouseOver={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = isRecruit ? "#EFF6FF" : "#F5F3FF";
          (e.currentTarget as HTMLElement).style.color = isRecruit ? "#1D4ED8" : "#1E1B4B";
        }
      }}
      onMouseOut={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#6B7280";
        }
      }}
    >
      <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
      {label}
      {isActive
        ? <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.6)" }} />
        : badge
      }
    </Link>
  );

  function isNavActive(href: string) {
    if (href === "/dashboard" || href === "/dashboard/recruit") {
      return location === href;
    }
    return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
  }

  const accentColor = isRecruit ? "#2563EB" : "#6B4EFF";
  const accentBorderColor = isRecruit ? "rgba(37,99,235,.12)" : "rgba(107,78,255,.12)";
  const accentBgColor = isRecruit ? "#EFF6FF" : "#F5F3FF";
  const accentTextColor = isRecruit ? "#1D4ED8" : "#1E1B4B";

  const sidebarContent = (
    <aside style={{
      display: "flex", flexDirection: "column", width: 256, height: "100%",
      background: "#FFFFFF", borderRight: `1px solid ${accentBorderColor}`,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", borderBottom: `1px solid ${accentBorderColor}` }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/favicon.svg" alt="HubCredo" style={{ width: 70, height: 30, objectFit: "contain", flexShrink: 0 }} />
          <div>
            <span style={{ color: "#1E1B4B", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.02em", display: "block", lineHeight: 1.2 }}>HubCredo</span>
            {isRecruit && (
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: accentColor, letterSpacing: ".06em", textTransform: "uppercase" }}>Recruit</span>
            )}
          </div>
        </Link>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: "#9CA3AF", cursor: "pointer" }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Workspace switch */}
      <div style={{ margin: "12px 12px 0" }}>
        <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${accentBorderColor.replace(".12", ".2")}`, background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: accentColor }} />
            {/* show the workspace based on current route so the toggle reads correctly */}
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1E1B4B" }}>{location.startsWith("/dashboard/recruit") ? "Recruit" : "Sales"} workspace</div>
            <div style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#6B7280" }}>{location.startsWith("/dashboard/recruit") ? "Active" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { handleWorkspaceSwitch(); }}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", background: isRecruit ? accentBgColor : accentColor, color: isRecruit ? accentTextColor : "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              {location.startsWith("/dashboard/recruit") ? "Switch to Sales mode" : "Switch to Recruit mode"}
            </button>
            <Link href="/dashboard/settings" onClick={() => { if (!isDesktop) onClose(); }} style={{ display: "flex", alignItems: "center", padding: "8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#6B7280", textDecoration: "none" }}>
              <ChevronRight style={{ width: 16, height: 16 }} />
            </Link>
          </div>
        </div>
      </div>

      {/* Credit balance pill */}
      {balance !== null && (
        <div style={{ margin: "12px 12px 0" }}>
          <Link href="/dashboard/billing" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: accentBgColor, border: `1px solid ${accentBorderColor.replace(".12", ".2")}`, borderRadius: 12, textDecoration: "none" }}>
            <Zap style={{ width: 14, height: 14, color: accentColor, flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: accentColor }}>{balance.toLocaleString()} credits</span>
            <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: accentColor, opacity: 0.7 }}>Top up →</span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".12em", padding: "4px 12px 8px" }}>Navigation</p>

        {isRecruit
          ? recruitNavItems.map(({ href, label, icon: Icon }) =>
              navLink(href, label, Icon, isNavActive(href))
            )
          : (
            <>
              {salesNavItems.map(({ href, label, icon: Icon }) => {
                const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
                return navLink(href, label, Icon, isActive);
              })}

              {/* Integrations */}
              <div style={{ paddingTop: 12 }}>
                <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".12em", padding: "0 12px 8px" }}>Integrations</p>
                {navLink("/dashboard/crm", "CRM (Attio)", Building2, isCrmActive, <span style={{ marginLeft: "auto", fontSize: "0.625rem", color: "#9CA3AF" }}>Attio</span>)}
                {navLink("/dashboard/hubspot", "HubSpot CRM", Building2, location === "/dashboard/hubspot" || location.startsWith("/dashboard/hubspot"), <span style={{ marginLeft: "auto", fontSize: "0.625rem", color: "#FF7A59", fontWeight: 600 }}>HS</span>)}
                {navLink("/dashboard/inboxkit", "InboxKit Domains", Globe, location === "/dashboard/inboxkit")}
                {navLink("/dashboard/replyio", "Reply.io Campaigns", Mail, location === "/dashboard/replyio")}
              </div>

              {/* Secondary */}
              <div style={{ paddingTop: 4 }}>
                {secondaryNavItems.map(({ href, label, icon: Icon }) =>
                  navLink(href, label, Icon, location === href)
                )}
              </div>

              {/* Pay for Tools CTA */}
              <div style={{ paddingTop: 8 }}>
                <Link
                  href="/dashboard/tools"
                  onClick={() => { if (!isDesktop) onClose(); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "linear-gradient(135deg,#6B4EFF,#8B5CF6)", color: "#fff", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, borderRadius: 10, boxShadow: "0 2px 8px rgba(107,78,255,.35)" }}
                >
                  <ShoppingCart style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span>Pay for Tools</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "rgba(255,255,255,.75)" }}>5 tools →</span>
                </Link>
              </div>
            </>
          )
        }
      </nav>

      {/* User footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${accentBorderColor}`, background: accentBgColor }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 6px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${accentColor},${isRecruit ? "#60A5FA" : "#8B5CF6"})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
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

  // Desktop: push layout (no overlay), slide in/out
  if (isDesktop) {
    return (
      <div style={{
        width: open ? 256 : 0,
        minHeight: "100vh",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.25s ease",
      }}>
        {sidebarContent}
      </div>
    );
  }

  // Mobile: overlay drawer
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(2px)", zIndex: 40,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s",
        }}
      />
      <div style={{
        position: "fixed", top: 0, bottom: 0, left: 0,
        zIndex: 50, width: 256,
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        boxShadow: "4px 0 24px rgba(0,0,0,.15)",
      }}>
        {sidebarContent}
      </div>
    </>
  );
}