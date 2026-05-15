import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#2563EB] text-sm font-medium tracking-widest uppercase mb-4">404</p>
        <h1 className="text-4xl font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
          Page Not Found
        </h1>
        <p className="text-[#64748B] mb-8">The page you're looking for doesn't exist.</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#2563EB] hover:text-[#1D4ED8] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
