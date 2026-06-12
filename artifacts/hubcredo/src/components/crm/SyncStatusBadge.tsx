import { CheckCircle, AlertCircle, Clock, XCircle } from "lucide-react";

export type SyncStatus = "not_synced" | "synced" | "pending" | "error";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  error?: string;
  syncedAt?: string;
}

export function SyncStatusBadge({ status, error, syncedAt }: SyncStatusBadgeProps) {
  const statusConfig: Record<
    SyncStatus,
    { icon: React.ReactNode; label: string; color: string; bgColor: string }
  > = {
    synced: {
      icon: <CheckCircle className="w-4 h-4" />,
      label: "Synced to CRM",
      color: "text-green-700",
      bgColor: "bg-green-50 border-green-200",
    },
    not_synced: {
      icon: <XCircle className="w-4 h-4" />,
      label: "Not synced",
      color: "text-gray-600",
      bgColor: "bg-gray-50 border-gray-200",
    },
    pending: {
      icon: <Clock className="w-4 h-4 animate-spin" />,
      label: "Syncing...",
      color: "text-blue-600",
      bgColor: "bg-blue-50 border-blue-200",
    },
    error: {
      icon: <AlertCircle className="w-4 h-4" />,
      label: "Sync error",
      color: "text-red-700",
      bgColor: "bg-red-50 border-red-200",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color}`}
      >
        {config.icon}
        <span>{config.label}</span>
      </div>
      {error && (
        <div className="text-xs text-red-600" title={error}>
          {error.length > 20 ? `${error.substring(0, 20)}...` : error}
        </div>
      )}
      {syncedAt && status === "synced" && (
        <div className="text-xs text-gray-500" title={syncedAt}>
          {new Date(syncedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
