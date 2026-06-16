import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[rgba(255,255,255,.04)] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#4f46e5] text-sm font-medium tracking-widest uppercase mb-4">404</p>
        <h1 className="text-4xl font-bold text-white mb-3" style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.05em" }}>
          Page Not Found
        </h1>
        <p className="text-[rgba(255,255,255,.5)] mb-8">The page you're looking for doesn't exist.</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#4f46e5] hover:text-[#4338ca] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
