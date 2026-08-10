import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Mail, Linkedin, Phone } from "lucide-react";

type AudienceToggle = "clients" | "candidates";
type ChannelTab = "email" | "linkedin" | "calling";

export default function RecruitOutreach() {
  const [, setLocation] = useLocation();
  const [audience, setAudience] = useState<AudienceToggle>("clients");
  const [channel, setChannel] = useState<ChannelTab>("email");

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Outreach</h1>
          <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: "0.9375rem" }}>
            Send outreach to clients or candidates across all channels
          </p>
        </div>

        {/* Audience toggle */}
        <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 24 }}>
          {([["clients", "Clients"], ["candidates", "Candidates"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAudience(id)}
              style={{
                padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: "0.875rem", fontWeight: 600,
                background: audience === id ? "#fff" : "transparent",
                color: audience === id ? "#0A0A0A" : "#64748B",
                boxShadow: audience === id ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                transition: "all .15s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Channel tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #E2E8F0" }}>
          {([
            ["email", "Email Campaigns", Mail],
            ["linkedin", "LinkedIn Outreach", Linkedin],
            ["calling", "Cold Calling", Phone],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setChannel(id)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: "0.875rem", fontWeight: 600,
              color: channel === id ? "#2563EB" : "#64748B",
              borderBottom: channel === id ? "2px solid #2563EB" : "2px solid transparent",
              marginBottom: -1,
            }}>
              <Icon style={{ width: 14, height: 14 }} />{label}
            </button>
          ))}
        </div>

        {/* Content: redirect to existing pages (audience_type filter handled by those pages) */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "36px 32px", textAlign: "center" }}>
          <p style={{ color: "#374151", fontWeight: 600, marginBottom: 8 }}>
            {channel === "email" ? "Email Campaigns" : channel === "linkedin" ? "LinkedIn Outreach" : "Cold Calling"} — {audience === "clients" ? "Client" : "Candidate"} audience
          </p>
          <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: 20 }}>
            The same outreach engine handles {audience}. Leads are filtered by <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, fontSize: "0.8rem" }}>audience_type = '{audience === "clients" ? "client" : "candidate"}'</code>.
          </p>
          <button
            onClick={() => setLocation(channel === "email" ? "/dashboard/campaigns" : channel === "linkedin" ? "/dashboard/linkedin" : "/dashboard/cold-calling")}
            style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
          >
            Open {channel === "email" ? "Campaigns" : channel === "linkedin" ? "LinkedIn Outreach" : "Cold Calling"} →
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
