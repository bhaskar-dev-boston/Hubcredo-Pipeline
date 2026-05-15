import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#F5A623] text-sm font-medium tracking-widest uppercase mb-4">404</p>
        <h1 className="text-4xl font-bold text-white mb-3" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
          Page Not Found
        </h1>
        <p className="text-[#888888] mb-8">The page you're looking for doesn't exist.</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#F5A623] hover:text-[#E09612] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
