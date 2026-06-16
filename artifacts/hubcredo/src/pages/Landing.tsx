import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Zap, Target, Users, Layers, CheckCircle } from "lucide-react";

const tools = [
  { id: "inboxkit",  name: "Inboxkit",  logo: "/logos/inboxkit.png",  bg: "#fff",    border: "#e3e8ef" },
  { id: "unipile",   name: "Unipile",   logo: "/logos/unipile.svg",   bg: "#091626", border: "rgba(99,102,241,.3)" },
  { id: "instantly", name: "Instantly", logo: "/logos/instantly.svg", bg: "#0a1929", border: "rgba(0,129,255,.4)" },
  { id: "attio",     name: "Attio",     logo: "/logos/attio.png",     bg: "#fff",    border: "#e3e8ef" },
  { id: "prospeo",   name: "Prospeo",   logo: "/logos/prospeo.jpg",   bg: "#fff",    border: "#fecaca" },
];

const ORBIT_POS: React.CSSProperties[] = [
  { top: "3%",  left: "50%", transform: "translateX(-50%)" },
  { top: "20%", right: "4%" },
  { bottom: "18%", right: "6%" },
  { bottom: "18%", left: "6%" },
  { top: "20%", left: "4%" },
];

const howItWorks = [
  {
    side: "left",
    n: "01",
    eyebrow: "Website analysis",
    title: "Share your website URL",
    desc: "AI reads your site in seconds — extracting your product positioning, target personas, value proposition, and competitive edge.",
    badges: [{ name: "AI Analysis", color: "#6366f1" }],
  },
  {
    side: "right",
    n: "02",
    eyebrow: "ICP extraction",
    title: "Get your Ideal Customer Profile",
    desc: "We build your ICP automatically: industry, company size, job titles, pain points, and buying triggers — all pre-filled and ready to refine.",
    badges: [{ name: "ICP Builder", color: "#7c3aed" }],
  },
  {
    side: "left",
    n: "03",
    eyebrow: "Lead generation",
    title: "Generate qualified LinkedIn leads",
    desc: "Find verified prospects that match your ICP directly from LinkedIn. Export enriched lead lists with emails and phone numbers ready to outreach.",
    badges: [{ name: "Prospeo", color: "#ef4444" }, { name: "Unipile", color: "#06b6d4" }],
  },
  {
    side: "right",
    n: "04",
    eyebrow: "GTM stack",
    title: "Build your personalised sales stack",
    desc: "Get the exact set of tools, sequences, and workflows for your stage, motion, and market — configured and connected, not just recommended.",
    badges: [{ name: "Instantly", color: "#0081ff" }, { name: "Attio", color: "#374151" }, { name: "Inboxkit", color: "#f97316" }],
  },
];

const features = [
  { icon: Target, eyebrow: "ICP extraction", title: "AI-powered ICP", desc: "Your ideal customer profile extracted from your website automatically — no manual forms.", color: "#4f46e5", bg: "rgba(79,70,229,.1)" },
  { icon: Users, eyebrow: "Lead generation", title: "LinkedIn leads at scale", desc: "Find and qualify B2B prospects that match your ICP with verified contact data.", color: "#10b981", bg: "rgba(16,185,129,.1)" },
  { icon: Layers, eyebrow: "GTM stack", title: "Personalised tool stack", desc: "Get the exact tools, not a generic list. Configured for your stage and motion.", color: "#7c3aed", bg: "rgba(124,58,237,.1)" },
];

const testimonials = [
  { q: "We went from zero outbound to 40 qualified meetings in 6 weeks. HubCredo did what our agency couldn't do in 6 months.", name: "Zara Whitfield", role: "Founder, Loopcore", initials: "ZW", grad: "linear-gradient(135deg,#6366f1,#8b5cf6)", featured: false },
  { q: "The ICP extraction alone saved me 3 weeks of workshopping. It just… works. We closed our first enterprise deal using HubCredo leads.", name: "Gabriel Park", role: "CEO, Stackrly", initials: "GP", grad: "linear-gradient(135deg,#ec4899,#f43f5e)", featured: true },
  { q: "I've tried 6 different GTM agencies. HubCredo is the first thing that actually helped me build consistent pipeline as a solo founder.", name: "Felix Nguyen", role: "Founder, DataLoom", initials: "FN", grad: "linear-gradient(135deg,#0ea5e9,#06b6d4)", featured: false },
];

const stats = [
  { num: "30 min", label: "To a live sales stack" },
  { num: "5×", label: "Faster than DIY setup" },
  { num: "50+", label: "Founders building with us" },
  { num: "4.9★", label: "Average satisfaction" },
];

// ─── inline style helpers ───────────────────────────────────────────
const S = {
  eyebrow: { fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#6366f1", marginBottom: 14 },
  h2: { fontSize: "clamp(2rem,3.6vw,3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, color: "#0a2540" },
  h2dark: { fontSize: "clamp(2rem,3.6vw,3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, color: "#fff" },
  card: { padding: 28, border: "1px solid #e3e8ef", borderRadius: 18, background: "#fff", transition: ".2s ease", cursor: "default" as const },
};

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40); }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: "#0a2540", overflowX: "hidden" }}>

      {/* ── NAV ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, height: 62, display: "flex", alignItems: "center", background: scrolled ? "rgba(5,16,31,.92)" : "transparent", backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none", borderBottom: scrolled ? "1px solid rgba(255,255,255,.06)" : "1px solid transparent", transition: "background .3s, border-color .3s" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 5%", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.03em", textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#4f46e5,#7c3aed 50%,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(79,70,229,.5)" }}><Zap style={{ width: 15, height: 15, color: "#fff" }} /></div>
            HubCredo
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <a href="#steps" style={{ fontSize: ".86rem", fontWeight: 500, color: "rgba(255,255,255,.65)", textDecoration: "none" }}>How it works</a>
            <a href="#features" style={{ fontSize: ".86rem", fontWeight: 500, color: "rgba(255,255,255,.65)", textDecoration: "none" }}>Features</a>
            <a href="#testimonials" style={{ fontSize: ".86rem", fontWeight: 500, color: "rgba(255,255,255,.65)", textDecoration: "none" }}>Customers</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/login" style={{ fontSize: ".86rem", fontWeight: 500, color: "rgba(255,255,255,.6)", textDecoration: "none" }}>Sign in</Link>
            <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, background: "#4f46e5", color: "#fff", textDecoration: "none", boxShadow: "0 2px 8px rgba(79,70,229,.35)" }}>Get started <ArrowRight style={{ width: 14, height: 14 }} /></Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "120px 6% 80px", overflow: "hidden", background: "#05101f" }}>
        <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,70,229,.38) 0%,transparent 70%)", top: -220, left: "50%", transform: "translateX(-50%)", filter: "blur(100px)", pointerEvents: "none", animation: "drift1 14s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,212,.2) 0%,transparent 70%)", bottom: -80, right: -80, filter: "blur(100px)", pointerEvents: "none", animation: "drift2 17s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle,rgba(124,58,237,.22) 0%,transparent 70%)", bottom: 100, left: -80, filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(ellipse 90% 70% at 50% 40%,black 20%,transparent 75%)" }} />

        <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center", maxWidth: 1240, margin: "0 auto", width: "100%" }}>
          {/* Left */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 100, padding: "8px 20px", fontSize: ".78rem", fontWeight: 500, color: "rgba(255,255,255,.65)", marginBottom: 28, backdropFilter: "blur(10px)" }}>
              <strong style={{ color: "rgba(255,255,255,.9)", fontWeight: 700 }}>Why we exist</strong>
              <span style={{ width: 1, height: 14, background: "rgba(255,255,255,.2)" }} />
              A belief, not just a business
            </div>
            <div style={{ fontSize: "clamp(2.8rem,4.8vw,4.6rem)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.04em", color: "#fff", marginBottom: 26 }}>
              <span style={{ display: "block", fontSize: "clamp(1.1rem,1.8vw,1.5rem)", fontWeight: 400, fontStyle: "italic", color: "rgba(255,255,255,.38)", marginBottom: 8 }}>The best product rarely wins.</span>
              <span style={{ background: "linear-gradient(135deg,#e0e7ff,#c7d2fe 40%,#a5f3fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>The best pipeline always does.</span>
            </div>
            <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "rgba(255,255,255,.5)", maxWidth: 480, marginBottom: 36 }}>
              Founders spend months stitching <strong style={{ color: "rgba(255,255,255,.82)" }}>6+ tools together</strong>, burning through agency budgets, just to send a cold email. HubCredo gives you the complete GTM stack, guided and live in 30 minutes.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 36 }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 8, fontSize: ".97rem", fontWeight: 600, background: "#4f46e5", color: "#fff", textDecoration: "none", boxShadow: "0 2px 8px rgba(79,70,229,.35)" }}>Build your stack free <ArrowRight style={{ width: 15, height: 15 }} /></Link>
              <a href="https://calendly.com/hubcredo/introductory-call" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 8, fontSize: ".97rem", fontWeight: 600, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.15)", backdropFilter: "blur(12px)", textDecoration: "none" }}>Book a demo</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex" }}>
                {[["ZW","#6366f1,#8b5cf6"],["GP","#ec4899,#f43f5e"],["FN","#0ea5e9,#06b6d4"],["SI","#10b981,#059669"],["SX","#f59e0b,#ef4444"]].map(([init, grad], i) => (
                  <div key={init} style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.15)", marginLeft: i === 0 ? 0 : -7, background: `linear-gradient(135deg,${grad})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".6rem", fontWeight: 700, color: "#fff" }}>{init}</div>
                ))}
              </div>
              <span style={{ fontSize: ".8rem", color: "rgba(255,255,255,.4)" }}><strong style={{ color: "rgba(255,255,255,.75)" }}>50+ founders</strong> already building with HubCredo · 4.9 / 5</span>
            </div>
          </div>

          {/* Right — orbit */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "relative", width: "100%", paddingTop: "90%" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 400 360" preserveAspectRatio="xMidYMid meet">
                  <ellipse cx="200" cy="180" rx="170" ry="150" stroke="rgba(99,102,241,.1)" strokeWidth="1" fill="none" strokeDasharray="4 10" />
                  <ellipse cx="200" cy="180" rx="90" ry="80" stroke="rgba(99,102,241,.06)" strokeWidth="1" fill="none" strokeDasharray="2 8" />
                  {tools.map((_, i) => {
                    const a = (i * 72 - 90) * Math.PI / 180;
                    return <line key={i} x1="200" y1="180" x2={200 + 170 * Math.cos(a)} y2={180 + 150 * Math.sin(a)} stroke="rgba(99,102,241,.18)" strokeWidth="1.2" strokeDasharray="3 8" />;
                  })}
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10, width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#1e1b4b,#0f172a)", border: "2px solid rgba(99,102,241,.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 10px rgba(79,70,229,.06),0 0 40px rgba(79,70,229,.25)", animation: "hubPulse 3s ease-in-out infinite" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <Zap style={{ width: 22, height: 22, color: "#c7d2fe" }} />
                    <span style={{ fontSize: ".45rem", fontWeight: 800, color: "rgba(255,255,255,.7)", letterSpacing: ".08em", textTransform: "uppercase" }}>HubCredo</span>
                  </div>
                </div>
                {tools.map((t, i) => (
                  <div key={t.id} style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, ...ORBIT_POS[i] }}>
                    <div style={{ width: 54, height: 54, borderRadius: 14, background: t.bg, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,.3)", padding: 10, animation: `float ${3.2 + i * 0.4}s ${i * 0.3}s ease-in-out infinite alternate` }}>
                      <img src={t.logo} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: ".6rem", fontWeight: 700, color: "rgba(255,255,255,.45)", whiteSpace: "nowrap" }}>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: ".8rem", color: "rgba(255,255,255,.3)", fontWeight: 500 }}>
              <strong style={{ color: "rgba(255,255,255,.55)" }}>5 pre-configured tools</strong> · set up and connected for you
            </p>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section style={{ background: "#fff", borderTop: "1px solid #e3e8ef", borderBottom: "1px solid #e3e8ef", padding: "56px 5%" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "#e3e8ef" }}>
          {[
            { stat: "87%", unit: "%", label: "of founders who DIY their GTM stack spend 3+ months getting first results" },
            { stat: "$12k", unit: "", label: "average wasted on agencies before founders find tools that actually convert" },
            { stat: "6+", unit: "", label: "disconnected tools the average B2B founder is managing before they hit HubCredo" },
          ].map((p) => (
            <div key={p.stat} style={{ background: "#fff", padding: "32px 28px" }}>
              <div style={{ fontSize: "2.4rem", fontWeight: 900, letterSpacing: "-0.05em", color: "#0a2540", lineHeight: 1, marginBottom: 8 }}>
                {p.stat}<span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#6366f1" }}>{p.unit}</span>
              </div>
              <p style={{ fontSize: ".88rem", lineHeight: 1.6, color: "rgba(10,37,64,.6)" }}>{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TICKER ── */}
      <section style={{ background: "#f6f9fc", borderBottom: "1px solid #e3e8ef", padding: "36px 0", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 100, background: "linear-gradient(90deg,#f6f9fc,transparent)", zIndex: 2 }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 100, background: "linear-gradient(-90deg,#f6f9fc,transparent)", zIndex: 2 }} />
        <p style={{ textAlign: "center", fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(10,37,64,.3)", marginBottom: 20 }}>Your complete outbound stack</p>
        <div style={{ display: "flex", width: "max-content", animation: "ticker 20s linear infinite" }}>
          {[...tools, ...tools].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 36px", borderRight: "1px solid #e3e8ef", whiteSpace: "nowrap" }}>
              <div style={{ width: 24, height: 24, borderRadius: 5, background: t.bg === "#fff" ? "#f6f9fc" : t.bg, border: "1px solid #e3e8ef", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={t.logo} alt={t.name} style={{ width: 18, height: 18, objectFit: "contain" }} />
              </div>
              <span style={{ fontSize: ".88rem", fontWeight: 700, color: "rgba(10,37,64,.6)" }}>{t.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="steps" style={{ background: "#fff", padding: "100px 0" }}>
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 72px", padding: "0 5%" }}>
          <p style={S.eyebrow}>How it works</p>
          <h2 style={S.h2}>From website to revenue<br />in four steps</h2>
          <p style={{ fontSize: "1rem", lineHeight: 1.75, color: "rgba(10,37,64,.6)", marginTop: 16 }}>
            Paste your URL. We handle everything else — analysis, ICP, leads, and the full GTM stack.
          </p>
        </div>

        {/* Alternating timeline */}
        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 5%", display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: "0 32px" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            {howItWorks.map((s, i) => (
              s.side === "left" ? (
                <div key={s.n} style={{ ...S.card, textAlign: "right", marginBottom: 40, width: "100%", marginTop: i > 0 ? 140 : 0 }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 40px rgba(79,70,229,.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(79,70,229,.2)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = "#e3e8ef"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
                >
                  <p style={{ ...S.eyebrow, textAlign: "right" }}>{s.eyebrow}</p>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0a2540", marginBottom: 10, lineHeight: 1.4 }}>{s.title}</h3>
                  <p style={{ fontSize: ".87rem", lineHeight: 1.65, color: "rgba(10,37,64,.6)" }}>{s.desc}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                    {s.badges.map(b => (
                      <span key={b.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f6f9fc", border: "1px solid #e3e8ef", borderRadius: 100, padding: "5px 12px", fontSize: ".73rem", fontWeight: 600, color: "rgba(10,37,64,.6)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                        {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={s.n} style={{ marginBottom: 40, width: "100%", marginTop: i === 0 ? 130 : 60 }} />
              )
            ))}
          </div>

          {/* Spine */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {howItWorks.map((s, i) => (
              <div key={s.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                {i > 0 && <div style={{ width: 2, flex: 1, minHeight: 60, background: "linear-gradient(180deg,#4f46e5,#06b6d4)", borderRadius: 2, position: "relative" }} />}
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", border: "3px solid #091626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".78rem", fontWeight: 800, color: "#fff", flexShrink: 0, boxShadow: "0 0 0 6px rgba(79,70,229,.14),0 4px 16px rgba(79,70,229,.4)", zIndex: 1, marginTop: i === 0 ? 130 : 0 }}>
                  {s.n}
                </div>
                <div style={{ width: 2, flex: 1, minHeight: 80, background: "linear-gradient(180deg,#7c3aed,#4f46e5)", borderRadius: 2 }} />
              </div>
            ))}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            {howItWorks.map((s, i) => (
              s.side === "right" ? (
                <div key={s.n} style={{ ...S.card, marginBottom: 40, width: "100%", marginTop: i === 1 ? 140 : i > 1 ? 140 : 0 }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 40px rgba(79,70,229,.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(79,70,229,.2)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = "#e3e8ef"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
                >
                  <p style={S.eyebrow}>{s.eyebrow}</p>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0a2540", marginBottom: 10, lineHeight: 1.4 }}>{s.title}</h3>
                  <p style={{ fontSize: ".87rem", lineHeight: 1.65, color: "rgba(10,37,64,.6)" }}>{s.desc}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                    {s.badges.map(b => (
                      <span key={b.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f6f9fc", border: "1px solid #e3e8ef", borderRadius: 100, padding: "5px 12px", fontSize: ".73rem", fontWeight: 600, color: "rgba(10,37,64,.6)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                        {b.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={s.n} style={{ marginBottom: 40, width: "100%", marginTop: i === 0 ? 0 : 60 }} />
              )
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ background: "#f6f9fc", padding: "100px 5%" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div style={{ textAlign: "center", maxWidth: 580, margin: "0 auto 60px" }}>
            <p style={S.eyebrow}>Why HubCredo</p>
            <h2 style={S.h2}>Everything a founder needs<br />to build consistent pipeline</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {features.map(({ icon: Icon, eyebrow, title, desc, color, bg }) => (
              <div key={title} style={{ background: "#fff", border: "1px solid #e3e8ef", borderRadius: 18, padding: 30, transition: ".2s ease" }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 40px rgba(79,70,229,.07)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(79,70,229,.2)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = "#e3e8ef"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <Icon style={{ width: 20, height: 20, color, strokeWidth: 1.5 }} />
                </div>
                <p style={{ ...S.eyebrow, marginBottom: 8 }}>{eyebrow}</p>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0a2540", marginBottom: 8, lineHeight: 1.4 }}>{title}</h3>
                <p style={{ fontSize: ".87rem", lineHeight: 1.65, color: "rgba(10,37,64,.6)" }}>{desc}</p>
              </div>
            ))}
            {/* Dark card */}
            <div style={{ background: "#05101f", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: 30, gridColumn: "span 1" }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <CheckCircle style={{ width: 20, height: 20, color: "#818cf8", strokeWidth: 1.5 }} />
              </div>
              <p style={{ ...S.eyebrow, color: "#818cf8", marginBottom: 8 }}>Guided setup</p>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", marginBottom: 8, lineHeight: 1.4 }}>Not just a tool. A co-founder for sales.</h3>
              <p style={{ fontSize: ".87rem", lineHeight: 1.65, color: "rgba(255,255,255,.45)" }}>Step-by-step onboarding, live configuration, and a stack that evolves with your business.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: "#05101f", position: "relative", overflow: "hidden", padding: "100px 5%" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 80% at 50% 0%,rgba(79,70,229,.25) 0%,transparent 60%)" }} />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 1140, margin: "0 auto" }}>
          <p style={{ ...S.eyebrow, color: "#818cf8" }}>By the numbers</p>
          <h2 style={{ ...S.h2dark, marginTop: 14, marginBottom: 56 }}>Built for founders who move fast</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "rgba(255,255,255,.05)", borderRadius: 28, overflow: "hidden", border: "1px solid rgba(255,255,255,.06)" }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ padding: "44px 28px", textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,.06)" : "none" }}>
                <div style={{ fontSize: "clamp(2.2rem,4vw,3.2rem)", fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, background: "linear-gradient(135deg,#e0e7ff,#c7d2fe 40%,#a5f3fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 10 }}>{s.num}</div>
                <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" style={{ background: "#fff", padding: "100px 5%" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div style={{ textAlign: "center", maxWidth: 520, margin: "0 auto 56px" }}>
            <p style={S.eyebrow}>Customer stories</p>
            <h2 style={S.h2}>Founders building pipeline<br />with HubCredo</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {testimonials.map((t) => (
              <div key={t.name} style={{ background: t.featured ? "linear-gradient(135deg,#0f172a,#1e1b4b)" : "#f6f9fc", border: t.featured ? "1px solid rgba(99,102,241,.2)" : "1px solid #e3e8ef", borderRadius: 18, padding: 28, transition: ".2s ease" }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,.07)"; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>{"★★★★★".split("").map((s, i) => <span key={i} style={{ color: "#f59e0b", fontSize: ".85rem" }}>{s}</span>)}</div>
                <p style={{ fontSize: ".9rem", lineHeight: 1.7, color: t.featured ? "rgba(255,255,255,.7)" : "rgba(10,37,64,.6)", marginBottom: 20 }}>"{t.q}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".75rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>{t.initials}</div>
                  <div>
                    <p style={{ fontSize: ".85rem", fontWeight: 700, color: t.featured ? "#fff" : "#0a2540" }}>{t.name}</p>
                    <p style={{ fontSize: ".75rem", color: t.featured ? "rgba(255,255,255,.35)" : "rgba(10,37,64,.3)", marginTop: 2 }}>{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: "#05101f", position: "relative", overflow: "hidden", padding: "120px 5%", textAlign: "center" }}>
        <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,70,229,.3) 0%,transparent 70%)", top: -200, left: "50%", transform: "translateX(-50%)", filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 640, margin: "0 auto" }}>
          <p style={{ ...S.eyebrow, color: "#818cf8" }}>Get started today</p>
          <h2 style={{ ...S.h2dark, marginTop: 14, marginBottom: 18 }}>Your GTM stack,<br />ready in 30 minutes</h2>
          <p style={{ color: "rgba(255,255,255,.5)", fontSize: "1.05rem", marginBottom: 44 }}>Stop paying agencies. Stop stitching tools. Start closing.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", borderRadius: 8, fontSize: "1rem", fontWeight: 600, background: "#4f46e5", color: "#fff", textDecoration: "none", boxShadow: "0 2px 8px rgba(79,70,229,.35)" }}>Build my stack free <ArrowRight style={{ width: 15, height: 15 }} /></Link>
            <a href="https://calendly.com/hubcredo/introductory-call" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", borderRadius: 8, fontSize: "1rem", fontWeight: 600, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.15)", backdropFilter: "blur(12px)", textDecoration: "none" }}>Book a demo</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#040b14", padding: "64px 5% 36px", color: "rgba(255,255,255,.4)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 48, marginBottom: 52 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: "1.1rem", color: "#fff", letterSpacing: "-.03em", marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}><Zap style={{ width: 12, height: 12, color: "#fff" }} /></div>
                HubCredo
              </div>
              <p style={{ fontSize: ".83rem", lineHeight: 1.7, maxWidth: 260 }}>The complete GTM stack for founders — guided, connected, and live in 30 minutes.</p>
            </div>
            <div>
              <h4 style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(255,255,255,.25)", marginBottom: 16 }}>Product</h4>
              <a href="#steps" style={{ display: "block", fontSize: ".84rem", marginBottom: 10, color: "rgba(255,255,255,.4)", textDecoration: "none" }}>How it works</a>
              <a href="#features" style={{ display: "block", fontSize: ".84rem", marginBottom: 10, color: "rgba(255,255,255,.4)", textDecoration: "none" }}>Features</a>
              <a href="#testimonials" style={{ display: "block", fontSize: ".84rem", color: "rgba(255,255,255,.4)", textDecoration: "none" }}>Customers</a>
            </div>
            <div>
              <h4 style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(255,255,255,.25)", marginBottom: 16 }}>Account</h4>
              <Link href="/login" style={{ display: "block", fontSize: ".84rem", marginBottom: 10, color: "rgba(255,255,255,.4)", textDecoration: "none" }}>Sign in</Link>
              <Link href="/signup" style={{ display: "block", fontSize: ".84rem", marginBottom: 10, color: "rgba(255,255,255,.4)", textDecoration: "none" }}>Get started</Link>
              <a href="https://calendly.com/hubcredo/introductory-call" target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: ".84rem", color: "rgba(255,255,255,.4)", textDecoration: "none" }}>Book a demo</a>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".78rem", flexWrap: "wrap", gap: 12 }}>
            <span>© {new Date().getFullYear()} HubCredo. All rights reserved.</span>
            <span>Built for founders who close.</span>
          </div>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');
        @keyframes drift1 { from { transform: translateX(-50%) translateY(0) scale(1); } to { transform: translateX(-47%) translateY(50px) scale(1.12); } }
        @keyframes drift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-45px,-70px) scale(1.18); } }
        @keyframes hubPulse { 0%,100% { box-shadow: 0 0 0 10px rgba(79,70,229,.06),0 0 40px rgba(79,70,229,.25); } 50% { box-shadow: 0 0 0 16px rgba(79,70,229,.04),0 0 60px rgba(79,70,229,.35); } }
        @keyframes float { from { transform: translateY(0); } to { transform: translateY(-10px); } }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        a:hover { color: #fff !important; transition: color .15s; }
        .nav-link:hover { color: #fff; }
      `}</style>
    </div>
  );
}
