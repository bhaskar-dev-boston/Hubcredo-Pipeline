// src/pages/dashboard/CrmHubSpotSettings.tsx
// Since HUBSPOT_API_KEY is set in Replit Secrets, this page just shows
// connection status and explains the sync behaviour. No API key input needed.
// Mirrors CrmSettings.tsx (Attio) exactly in structure — HubSpot orange
// branding swapped in, setup steps point at the Private App flow instead
// of Attio's access-token flow.

import { useState, useEffect } from "react";
import {
  CheckCircle2, RefreshCw, Link2, Clock,
  AlertCircle, Loader2, Building2,
} from "lucide-react";

interface ConnectionStatus {
  connected: boolean;
  hub_id?: string;
  scopes?: string[];
}

export function CrmHubSpotSettings() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/crm-hs/connection", {
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
      <div className="flex items-start gap-4 p-5 bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="w-11 h-11 rounded-xl bg-[rgba(255,122,89,.1)] border border-[rgba(255,122,89,.25)] flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="17.5" cy="6.5" r="2.5" fill="#FF7A59" />
            <path d="M14 9.5a4.5 4.5 0 1 0 3.2 7.66" stroke="#FF7A59" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M14.5 11.5 11 8" stroke="#FF7A59" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="6" r="2" fill="#FF7A59" opacity="0.5" />
            <circle cx="14" cy="15.5" r="3.5" fill="#FF7A59" opacity="0.85" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-900 font-semibold text-base leading-tight">HubSpot CRM</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Sync approved leads as contacts in HubSpot. Configured via server secrets.
          </p>
        </div>
      </div>

      {/* Connection status */}
      {loading ? (
        <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
          <Loader2 className="w-5 h-5 animate-spin text-[#FF7A59]" />
          <p className="text-sm text-gray-500">Checking connection…</p>
        </div>
      ) : status?.connected ? (
        <div className="flex items-center gap-3 p-4 bg-[rgba(22,163,74,.08)] border border-[rgba(22,163,74,.2)] rounded-2xl">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">HubSpot is connected</p>
            {status.hub_id && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Hub ID: {status.hub_id}
              </p>
            )}
            {status.scopes && status.scopes.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {status.scopes.length} scope{status.scopes.length === 1 ? "" : "s"} granted
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-600">HubSpot not connected</p>
            <p className="text-xs text-red-500 mt-0.5">
              Add{" "}
              <code className="bg-red-100 border border-red-200 px-1 rounded text-red-600">
                HUBSPOT_API_KEY
              </code>{" "}
              to your Replit Secrets and restart the server.
            </p>
          </div>
        </div>
      )}

      {/* How CRM sync works */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
            title: "On approval",
            desc: "Lead synced as HubSpot contact",
            accent: "rgba(22,163,74,.08)",
            border: "rgba(22,163,74,.2)",
          },
          {
            icon: <RefreshCw className="w-4 h-4 text-[#FF7A59]" />,
            title: "On reply",
            desc: "Note pushed to HubSpot contact",
            accent: "rgba(255,122,89,.08)",
            border: "rgba(255,122,89,.2)",
          },
          {
            icon: <Link2 className="w-4 h-4 text-[#0a9bb0]" />,
            title: "Sync badge",
            desc: "Shows synced, error, or pending",
            accent: "rgba(0,150,167,.08)",
            border: "rgba(0,150,167,.2)",
          },
          {
            icon: <Clock className="w-4 h-4 text-orange-500" />,
            title: "Manual sync",
            desc: "Re-sync from any lead card",
            accent: "rgba(234,88,12,.08)",
            border: "rgba(234,88,12,.2)",
          },
        ].map(({ icon, title, desc, accent, border }) => (
          <div
            key={title}
            className="p-3.5 rounded-xl bg-white shadow-sm"
            style={{
              background: accent,
              border: `1px solid ${border}`,
            }}
          >
            <div className="mb-2">{icon}</div>
            <p className="text-xs font-semibold text-gray-800">{title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{desc}</p>
          </div>
        ))}
      </div>

      {/* Setup instructions */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800">Setup</h4>
        <ol className="space-y-2">
          {[
            <>
              In HubSpot:{" "}
              <strong className="text-gray-900 font-semibold">
                Settings → Integrations → Private Apps → Create a private app
              </strong>
              . Under Scopes, grant{" "}
              <code className="text-xs bg-gray-100 border border-gray-200 px-1 rounded text-gray-700">
                crm.objects.contacts.read/write
              </code>{" "}
              and{" "}
              <code className="text-xs bg-gray-100 border border-gray-200 px-1 rounded text-gray-700">
                crm.objects.companies.read/write
              </code>
              .
            </>,
            <>
              In Replit: open{" "}
              <strong className="text-gray-900 font-semibold">Secrets</strong> (lock icon) → add key{" "}
              <code className="text-xs bg-gray-100 border border-gray-200 px-1 rounded text-gray-700">
                HUBSPOT_API_KEY
              </code>{" "}
              → paste the Private App access token shown once after creating the app.
            </>,
            <span className="text-gray-500">
              Restart the Replit server. The status above will turn green.
            </span>,
          ].map((text, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#FF7A59] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 pt-1">
          Note: this is a different token from the Developer API Key shown in your
          HubSpot developer account — that one manages app/account settings, not CRM
          data, and won't work here.
        </p>
      </div>
    </div>
  );
}