import { useState } from "react";
import { Loader2, LogOut, CheckCircle } from "lucide-react";

interface AttioConnectProps {
  isConnected: boolean;
  workspaceName?: string;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  isLoading?: boolean;
}

export function AttioConnect({
  isConnected,
  workspaceName,
  onConnect,
  onDisconnect,
  isLoading = false,
}: AttioConnectProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isConnected) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[#0A0A0A] font-semibold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Attio Connected
            </h2>
            {workspaceName && (
              <p className="text-sm text-[#64748B] mt-1">Workspace: {workspaceName}</p>
            )}
            <p className="text-sm text-[#64748B] mt-2">
              Your HubCredo leads will be automatically synced to Attio when approved.
            </p>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
        >
          {isDisconnecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          Disconnect Attio
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div>
        <h2 className="text-[#0A0A0A] font-semibold">Connect Attio CRM</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Sync your HubCredo leads directly to Attio to keep your CRM pipeline up to date
          automatically.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>What happens when you connect:</strong>
        </p>
        <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
          <li>Approved leads are automatically created as contacts in Attio</li>
          <li>Email opens, replies, and LinkedIn activity are logged as contact activities</li>
          <li>You can customize which fields to sync in the field mapper</li>
        </ul>
      </div>

      <button
        onClick={onConnect}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {isLoading ? "Connecting..." : "Connect with Attio"}
      </button>
    </div>
  );
}
