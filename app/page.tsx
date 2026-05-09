import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "var(--parchment)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl flicker">🔥</span>
          <span className="font-display text-xl font-semibold" style={{ color: "var(--smoke)" }}>
            FireReady<span style={{ color: "var(--ember)" }}>Farm</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium" style={{ color: "var(--clay)" }}>
          <a href="#how" className="hover:text-stone-800 transition-colors">How It Works</a>
          <a href="#why" className="hover:text-stone-800 transition-colors">Why It Matters</a>
          <Link href="/assess" className="px-4 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 pulse-ember"
            style={{ background: "var(--ember)" }}>
            Start Assessment
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-8 pt-20 pb-24 max-w-6xl mx-auto">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--ember-light), transparent)" }} />
        <div className="absolute bottom-0 left-20 w-64 h-64 rounded-full opacity-8 blur-2xl"
          style={{ background: "radial-gradient(circle, var(--warn), transparent)" }} />

        <div className="animate-rise">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ background: "#FEE2D5", color: "var(--ember)" }}>
            🌾 Agricultural Wildfire Intelligence
          </span>
        </div>

        <h1 className="animate-rise-1 font-display text-6xl md:text-7xl font-bold leading-tight max-w-3xl mb-6"
          style={{ color: "var(--smoke)" }}>
          Is Your Farm
          <span className="block italic" style={{ color: "var(--ember)" }}>Fire Ready?</span>
        </h1>

        <p className="animate-rise-2 text-lg max-w-xl leading-relaxed mb-10"
          style={{ color: "var(--clay)" }}>
          Get a personalized wildfire risk score for your agricultural property in minutes.
          Understand your vulnerabilities and get actionable steps to protect your land, livestock, and livelihood.
        </p>

        <div className="animate-rise-3 flex flex-wrap gap-4 mb-16">
          <Link href="/assess"
            className="flex items-center gap-2 px-8 py-4 rounded-full text-white font-semibold text-lg transition-all hover:opacity-90 hover:-translate-y-0.5 shadow-lg"
            style={{ background: "linear-gradient(135deg, var(--ember), var(--ember-dark))" }}>
            <span>🔍</span> Assess My Property
          </Link>
          <a href="#how"
            className="flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg transition-all hover:bg-stone-100 border-2"
            style={{ borderColor: "var(--bark)", color: "var(--bark)" }}>
            See How It Works
          </a>
        </div>

        {/* Stats */}
        <div className="animate-rise-4 grid grid-cols-3 gap-6 max-w-xl">
          {[
            { stat: "43M+", label: "Acres burned annually in the US" },
            { stat: "70%", label: "Of farms are in wildfire-risk zones" },
            { stat: "5 min", label: "To get your risk assessment" },
          ].map((s) => (
            <div key={s.stat} className="text-center p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E7E5E4" }}>
              <div className="font-display text-2xl font-bold" style={{ color: "var(--ember)" }}>{s.stat}</div>
              <div className="text-xs mt-1 leading-tight" style={{ color: "var(--clay)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-8" style={{ background: "white", borderTop: "1px solid #E7E5E4" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-4xl font-bold text-center mb-3" style={{ color: "var(--smoke)" }}>
            How It Works
          </h2>
          <p className="text-center mb-14" style={{ color: "var(--clay)" }}>
            Three steps to wildfire preparedness
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: "📍", step: "01", title: "Enter Your Property", desc: "Tell us your location, property type, and size. Upload an aerial photo for enhanced analysis." },
              { icon: "🤖", step: "02", title: "AI Risk Analysis", desc: "Our model evaluates vegetation, topography, wind patterns, drought index, and proximity to past fires." },
              { icon: "📋", step: "03", title: "Get Your Action Plan", desc: "Receive a wildfire risk score and a prioritized checklist of protective measures tailored to your farm." },
            ].map((item) => (
              <div key={item.step} className="relative p-6 rounded-2xl" style={{ background: "var(--parchment)", border: "1px solid #E7E5E4" }}>
                <span className="absolute top-4 right-4 text-xs font-bold tracking-widest" style={{ color: "#D6D3D1" }}>{item.step}</span>
                <span className="text-3xl mb-4 block">{item.icon}</span>
                <h3 className="font-display text-xl font-semibold mb-2" style={{ color: "var(--smoke)" }}>{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--clay)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section id="why" className="py-20 px-8 max-w-5xl mx-auto">
        <div className="rounded-3xl p-10 md:p-14 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, var(--smoke), var(--ash))" }}>
          <div className="absolute top-0 right-0 w-80 h-80 opacity-10"
            style={{ background: "radial-gradient(circle, var(--ember-light), transparent)" }} />
          <h2 className="font-display text-4xl font-bold text-white mb-4">
            Wildfires don&apos;t wait.<br />
            <span className="italic" style={{ color: "#FCA16C" }}>Neither should you.</span>
          </h2>
          <p className="text-stone-300 max-w-lg mb-8 leading-relaxed">
            Agricultural land makes up the majority of wildfire-affected areas. Yet most farms lack a formal risk assessment.
            FireReady Farm bridges that gap — giving ranchers, vintners, and smallholders the same intelligence
            that large insurers use, for free.
          </p>
          <Link href="/assess"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--ember)", color: "white" }}>
            Start Your Free Assessment →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-8 py-8 flex items-center justify-between text-sm"
        style={{ borderColor: "#E7E5E4", color: "var(--clay)" }}>
        <div className="flex items-center gap-2">
          <span className="flicker">🔥</span>
          <span className="font-display font-semibold" style={{ color: "var(--smoke)" }}>FireReadyFarm</span>
        </div>
        <span>Built for the 2026 UCSD Reboot the Earth Hackathon · Mock data only</span>
      </footer>
    </main>
  );
}
