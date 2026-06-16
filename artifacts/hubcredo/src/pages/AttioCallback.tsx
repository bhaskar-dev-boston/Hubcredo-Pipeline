import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function AttioCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || error || "Unknown error");
      // Notify parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "attio-oauth-error",
            error: errorDescription || error,
          },
          window.location.origin
        );
      }
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Missing authorization code or state");
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "attio-oauth-error",
            error: "Missing authorization code or state",
          },
          window.location.origin
        );
      }
      return;
    }

    // Exchange code for token
    const exchangeCode = async () => {
      try {
        const response = await fetch("/api/crm/callback/attio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}`);
        }

        const data = await response.json();
        setStatus("success");
        setMessage("Connected successfully!");

        // Notify parent window
        if (window.opener) {
          window.opener.postMessage(
            {
              type: "attio-oauth-success",
              data,
            },
            window.location.origin
          );
        }

        // Close window after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);
      } catch (error) {
        setStatus("error");
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setMessage(errorMessage);

        if (window.opener) {
          window.opener.postMessage(
            {
              type: "attio-oauth-error",
              error: errorMessage,
            },
            window.location.origin
          );
        }
      }
    };

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[rgba(255,255,255,.04)]">
      <div className="bg-[rgba(255,255,255,.04)] rounded-lg shadow-lg p-8 max-w-sm w-full mx-4">
        {status === "loading" && (
          <div className="space-y-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#4f46e5]" />
            <p className="text-sm text-[rgba(255,255,255,.5)]">Connecting to Attio...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-white">{message}</p>
            <p className="text-xs text-[rgba(255,255,255,.5)]">This window will close automatically...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="font-semibold text-white">Connection failed</p>
            <p className="text-sm text-[rgba(255,255,255,.5)]">{message}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 bg-[#4f46e5] text-white text-sm font-medium rounded-lg hover:bg-[#4338ca] transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
