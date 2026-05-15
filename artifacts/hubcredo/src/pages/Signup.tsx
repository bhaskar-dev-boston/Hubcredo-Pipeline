import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Zap, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { setToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      setToken(data.token);
      setLocation("/onboarding");
    } catch (err: unknown) {
      toast({
        title: "Signup failed",
        description: err instanceof Error ? err.message : "Please try again",
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
        options: {
          redirectTo: `${window.location.origin}/api/auth/oauth/callback`,
        },
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
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[#F5A623] rounded flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#0E0E0E]" />
            </div>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: "0.08em" }} className="text-white">
              HubCredo
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-[#888888] text-sm">Start building your sales infrastructure</p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-white hover:bg-[#1C1C1C] transition-colors mb-4 disabled:opacity-50"
          data-testid="button-google-signup"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[#2A2A2A]" />
          <span className="text-xs text-[#888888]">or</span>
          <div className="flex-1 h-px bg-[#2A2A2A]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[#888888] mb-1.5">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Doe"
              className="w-full px-3 py-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              data-testid="input-fullname"
            />
          </div>
          <div>
            <label className="block text-sm text-[#888888] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              data-testid="input-email"
            />
          </div>
          <div>
            <label className="block text-sm text-[#888888] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
              className="w-full px-3 py-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/30 transition-colors"
              data-testid="input-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-sm disabled:opacity-50"
            data-testid="button-signup"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>
        </form>

        <p className="text-center text-sm text-[#888888] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#F5A623] hover:text-[#E09612] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
