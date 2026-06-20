import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { setToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "https://lead-stack-engine.onrender.com";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token, data.refresh_token);
      setLocation("/dashboard");
    } catch (err: unknown) {
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${API_URL}/api/auth/oauth/callback` },
      });
      if (error) throw error;
    } catch (err: unknown) {
      toast({
        title: "Google sign-in failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#05101f", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", fontFamily: "'Inter', system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Orbs */}
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,70,229,.3) 0%,transparent 70%)", top: -160, left: "50%", transform: "translateX(-50%)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,212,.15) 0%,transparent 70%)", bottom: -60, right: -40, filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 10 }}>
            <img src="/favicon.svg" alt="HubCredo" style={{ width: 280, height: 120, objectFit: "contain" }} />
            <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.03em" }}></span>
          </Link>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 4 }}>Welcome back</h1>
          <p style={{ fontSize: ".88rem", color: "rgba(255,255,255,.45)" }}>Sign in to your account</p>
        </div>

        {/* Card */}
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 18, backdropFilter: "blur(16px)" }}>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            data-testid="button-google-signin"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: ".9rem", fontWeight: 500, color: "#fff", cursor: "pointer", marginBottom: 14, transition: "all .15s" }}
            onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,.12)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,.07)"; }}
          >
            {googleLoading ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : (
              <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
            <span style={{ fontSize: ".8rem", color: "rgba(255,255,255,.3)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <label style={{ display: "block", fontSize: ".84rem", fontWeight: 500, color: "rgba(255,255,255,.65)", marginBottom: 5 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                data-testid="input-email"
                style={{ width: "100%", padding: "9px 14px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: ".9rem", color: "#fff", outline: "none", transition: "border-color .15s", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "rgba(99,102,241,.6)"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,.12)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,.12)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: ".84rem", fontWeight: 500, color: "rgba(255,255,255,.65)", marginBottom: 5 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                data-testid="input-password"
                style={{ width: "100%", padding: "9px 14px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: ".9rem", color: "#fff", outline: "none", transition: "border-color .15s", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "rgba(99,102,241,.6)"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,.12)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,.12)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="button-login"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 16px", background: "#4f46e5", border: "none", borderRadius: 10, fontSize: ".95rem", fontWeight: 600, color: "#fff", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, boxShadow: "0 2px 8px rgba(79,70,229,.4)", transition: "all .15s" }}
              onMouseOver={e => { if (!loading) { e.currentTarget.style.background = "#4338ca"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(79,70,229,.5)"; }}}
              onMouseOut={e => { e.currentTarget.style.background = "#4f46e5"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(79,70,229,.4)"; }}
            >
              {loading && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
              Sign in
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: ".87rem", color: "rgba(255,255,255,.35)", marginTop: 14 }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "#818cf8", fontWeight: 600, textDecoration: "none" }}>Sign up</Link>
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,.25); }
      `}</style>
    </div>
  );
}