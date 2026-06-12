// src/pages/dashboard/CrmSettings.tsx
// Since ATTIO_API_KEY is set in Replit Secrets, this page just shows
// connection status and explains the sync behaviour. No API key input needed.

import { useState, useEffect } from "react";
import {
  CheckCircle2, RefreshCw, Link2, Clock,
  AlertCircle, Loader2, Building2,
} from "lucide-react";

interface ConnectionStatus {
  connected: boolean;
  workspace_id?: string;
  workspace_name?: string;
}

export function CrmSettings() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/crm/connection", {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((r) => r.json())
      .then((d) => setStatus(d.connected ? d : null))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 p-5 bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
        <div className="w-11 h-11 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="#16A34A" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="#16A34A" opacity="0.5" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="#16A34A" opacity="0.5" />
            <rect x="13" y="13" width="8" height="8" rx="2" fill="#16A34A" opacity="0.25" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#0A0A0A] font-semibold text-base leading-tight">Attio CRM</h3>
          <p className="text-sm text-[#64748B] mt-0.5">
            Sync approved leads as contacts in Attio. Configured via server secrets.
          </p>
        </div>
      </div>

      {/* Connection status */}
      {loading ? (
        <div className="flex items-center gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
          <p className="text-sm text-[#64748B]">Checking connection…</p>
        </div>
      ) : status?.connected ? (
        <div className="flex items-center gap-3 p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl">
          <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#16A34A]">Attio is connected</p>
            {status.workspace_name && (
              <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Workspace: {status.workspace_name}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Attio not connected</p>
            <p className="text-xs text-red-600 mt-0.5">
              Add <code className="bg-red-100 px-1 rounded">ATTIO_API_KEY</code> to your Replit Secrets and restart the server.
            </p>
          </div>
        </div>
      )}

      {/* How CRM sync works */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />, title: "On approval", desc: "Lead synced as Attio People contact" },
          { icon: <RefreshCw className="w-4 h-4 text-[#2563EB]" />, title: "On reply", desc: "Note pushed to Attio contact" },
          { icon: <Link2 className="w-4 h-4 text-[#7C3AED]" />, title: "Sync badge", desc: "Shows synced, error, or pending" },
          { icon: <Clock className="w-4 h-4 text-[#EA580C]" />, title: "Manual sync", desc: "Re-sync from any lead card" },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
            <div className="mb-2">{icon}</div>
            <p className="text-xs font-semibold text-[#0A0A0A]">{title}</p>
            <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">{desc}</p>
          </div>
        ))}
      </div>

      {/* Setup instructions */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0A0A0A]">Setup</h4>
        <ol className="space-y-2">
          {[
            <>In Attio: <strong>Workspace Settings → Developers → New access token</strong>. Enable <code className="text-xs bg-white border border-[#E2E8F0] px-1 rounded">record_permission:read-write</code> and <code className="text-xs bg-white border border-[#E2E8F0] px-1 rounded">note:read-write</code>.</>,
            <>In Replit: open <strong>Secrets</strong> (lock icon) → add key <code className="text-xs bg-white border border-[#E2E8F0] px-1 rounded">ATTIO_API_KEY</code> → paste your token.</>,
            "Restart the Replit server. The status above will turn green.",
          ].map((text, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-[#475569] leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}