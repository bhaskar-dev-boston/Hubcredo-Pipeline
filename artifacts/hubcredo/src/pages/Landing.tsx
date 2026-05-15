import { Link } from "wouter";
import { ArrowRight, Zap, Target, Users, Layers } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "ICP Extraction",
    description: "AI analyses your website and extracts your Ideal Customer Profile automatically.",
  },
  {
    icon: Users,
    title: "Lead Generation",
    description: "Find and qualify LinkedIn leads that match your ICP with one click.",
  },
  {
    icon: Layers,
    title: "Sales Stack",
    description: "Get a personalised go-to-market stack tailored to your stage and motion.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0E0E0E] text-white flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#F5A623] rounded flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#0E0E0E]" />
          </div>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", letterSpacing: "0.08em" }}>
            HubCredo
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-[#888888] hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="flex items-center gap-2 px-4 py-2 bg-[#F5A623] text-[#0E0E0E] text-sm font-semibold rounded-lg hover:bg-[#E09612] transition-colors"
          >
            Get started <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-full text-[#F5A623] text-xs font-medium tracking-wide mb-8">
          <Zap className="w-3 h-3" /> Guided sales infrastructure for founders
        </div>

        <h1
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em", lineHeight: 1.05 }}
          className="text-6xl md:text-8xl font-bold mb-6 max-w-4xl"
        >
          Your entire GTM
          <br />
          <span className="text-[#F5A623]">infrastructure.</span>
          <br />
          Built in minutes.
        </h1>

        <p className="text-[#888888] text-lg max-w-xl mb-10 leading-relaxed">
          HubCredo analyses your product, extracts your ICP, generates qualified leads, and builds
          the exact sales stack you need — so you can close faster.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="flex items-center gap-2 px-6 py-3 bg-[#F5A623] text-[#0E0E0E] font-semibold rounded-lg hover:bg-[#E09612] transition-colors text-base"
          >
            Start for free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 border border-[#2A2A2A] text-[#888888] hover:text-white hover:border-[#444] rounded-lg transition-colors text-base"
          >
            Sign in
          </Link>
        </div>
      </main>

      {/* Features */}
      <section className="border-t border-[#2A2A2A] px-8 py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col gap-4">
              <div className="w-10 h-10 bg-[#F5A623]/10 border border-[#F5A623]/20 rounded-lg flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#F5A623]" />
              </div>
              <h3 className="text-white font-semibold">{title}</h3>
              <p className="text-[#888888] text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#2A2A2A] px-8 py-6 text-center text-[#888888] text-xs">
        © {new Date().getFullYear()} HubCredo. All rights reserved.
      </footer>
    </div>
  );
}
