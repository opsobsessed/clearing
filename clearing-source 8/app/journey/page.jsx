"use client";
// Public, unauthenticated page — this is the one link meant to go in your Instagram bio.
// Tells your story, then lays out every way someone can work with you: book a session (with or
// without the app bundled in), get just the app on its own, or browse your Gumroad products.
//
// EDIT THESE before going live — search for "PASTE" below:
const LINKS = {
  // Your Google Calendar appointment-schedule booking page link (Calendar > Create > Appointment schedule > Copy link)
  bookingCalendar: "https://calendar.app.google/dMTvbJ4cjVqh9PtG9",
  // Razorpay Payment Link for the ₹1,000 tier (Dashboard > Payment Links)
  paymentLink1000: "https://rzp.io/rzp/ZjEHKFi",
  // Razorpay Payment Link for the ₹3,500 tier
  paymentLink3500: "https://rzp.io/rzp/RYKbGsB",
  // Add one object per live Gumroad product: { name: "Product name", url: "https://..." }
  gumroad: [],
  // A Razorpay Payment PAGE (not a Payment Link — Payment Links are fixed-amount only) with a
  // "Customer Decides Amount" price field. Optional pay-what-you-want support option.
  supportPage: "PASTE_YOUR_SUPPORT_PAYMENT_PAGE_LINK_HERE",
};

const C = {
  bg: "#F9F9FF", surface: "#FFFFFF", surface2: "#E8EDFF", line: "#C3C6D6",
  text: "#041B3C", muted: "#434654", faint: "#737685",
  primary: "#0052CC", teal: "#00875A", coral: "#DE350B", violet: "#5243AA",
};

// Placeholder story beats — replace with your real bullet points once you send them over.
// Keeping this as an array of short paragraphs makes it easy to swap in the real narrative
// without touching any layout code below.
const STORY = [
  "Over 7 years, I took out 56 loans. By the end, 48 of them were payday loans — what started as a handful of loans to cover gaps turned into a cycle of using new loans to keep older ones from defaulting, until payday loans made up almost everything I owed.",
  "In total, that added up to ₹1.2 crore. Around ₹66 lakh of it was money that went purely into refinancing payday loan payments — loans taken just to service other loans — and that portion alone ballooned within 14 months. That's how fast this kind of debt compounds when you're rolling it forward instead of paying it down.",
  "I'm still working through it. There's no clean ending here, and I'm not going to pretend there is. What I can tell you is how shameful and lonely this gets — how hard it is to say out loud, how easy it is to believe you're the only one who let it get this bad. I had to fight for every piece of information I now have: what a recovery agent is actually legally allowed to do, how to tell if a lender is even real, what rights I had that nobody told me about. I wanted a place for that to exist, so nobody else has to fight that hard just to find it. That's Clearing, and that's why I'm here.",
];

function OfferCard({ eyebrow, title, price, bullets, ctaLabel, ctaHref, highlight }) {
  return (
    <div style={{ background: C.surface, border: "1px solid " + (highlight ? C.primary : C.line), borderRadius: 16, padding: 22, position: "relative" }}>
      {highlight && (
        <div style={{ position: "absolute", top: -11, left: 20, background: C.primary, color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 999 }}>
          Most support
        </div>
      )}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em" }}>{eyebrow}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
        <div style={{ fontWeight: 700, fontSize: 22 }}>{price}</div>
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
        {bullets.map((b) => (
          <div key={b} style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{b}</div>
        ))}
      </div>
      <a href={ctaHref} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        <div style={{ marginTop: 16, textAlign: "center", background: highlight ? C.primary : "#fff", color: highlight ? "#fff" : C.text, border: highlight ? "none" : "1px solid " + C.line, borderRadius: 8, padding: "11px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {ctaLabel}
        </div>
      </a>
    </div>
  );
}

export default function JourneyPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.text, padding: "40px 20px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ fontFamily: "'Work Sans',system-ui,sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "-.02em" }}>Financially Clueless</div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>
          7 years, 56 loans, ₹1.2 crore — still working through it. I built Clearing so you don't have to fight this alone.
        </div>

        {/* Quick links — this is the actual "link tree" part. Someone who already knows what they
            want (try the app, book a session, browse products) can jump straight there without
            reading the story first. Put THIS page's link in your bio, not the bare homepage — this
            is the one place every other link lives. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
          <a href="/pricing" style={{ textDecoration: "none" }}>
            <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>
              Try the app →
            </div>
          </a>
          <a href="#offers" style={{ textDecoration: "none" }}>
            <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>
              Book a 1:1 →
            </div>
          </a>
          <a href="#products" style={{ textDecoration: "none" }}>
            <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>
              Digital products →
            </div>
          </a>
          <a href="#support" style={{ textDecoration: "none" }}>
            <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>
              Just want to help →
            </div>
          </a>
        </div>

        {/* Story */}
        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>My story</div>
        <div style={{ background: C.surface, border: "1px solid " + C.line, borderRadius: 16, padding: 22, marginBottom: 36, display: "grid", gap: 12 }}>
          {STORY.map((p, i) => (
            <div key={i} style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{p}</div>
          ))}
        </div>

        {/* Offers */}
        <div id="offers" style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Work with me</div>
        <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
          <OfferCard
            eyebrow="Talk it through"
            title="1:1 session"
            price="₹1,000"
            bullets={["One 1:1 session with me, focused on your specific situation", "Doesn't include the app — see below if you want that separately or bundled"]}
            ctaLabel="Book a session"
            ctaHref={LINKS.paymentLink1000}
          />
          <OfferCard
            highlight
            eyebrow="Full support"
            title="1:1 session + Clearing, unlocked forever"
            price="₹3,500"
            bullets={["One 1:1 session with me", "Permanent access to Clearing — no 7-day limit"]}
            ctaLabel="Book full support"
            ctaHref={LINKS.paymentLink3500}
          />
        </div>
        <div style={{ background: C.surface2, borderRadius: 12, padding: "14px 16px", marginBottom: 36 }}>
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
            Just want the app, no session? Clearing is also available on its own — <a href="/pricing" style={{ color: C.primary, fontWeight: 600 }}>see app-only pricing</a> (₹300 for a 7-day trial, ₹3,000 to unlock forever).
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 36, lineHeight: 1.5 }}>
          After paying, you'll book your session time here: <a href={LINKS.bookingCalendar} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontWeight: 600 }}>pick a slot</a>.
        </div>

        {/* Gumroad */}
        <div id="products" style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Digital products</div>
        {LINKS.gumroad.length === 0 ? (
          <div style={{ fontSize: 13.5, color: C.faint, marginBottom: 36 }}>More on the way — check back soon.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 36 }}>
            {LINKS.gumroad.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", background: "#fff", border: "1px solid " + C.line, borderRadius: 12, padding: "12px 14px" }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: C.primary, fontWeight: 600 }}>open →</span>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Optional pay-what-you-want support option — deliberately understated, sits below the
            priced offers so it reads as a bonus way to help, not a cheaper alternative to them. */}
        <div id="support" style={{ border: "1px dashed " + C.line, borderRadius: 12, padding: "14px 16px", marginBottom: 36 }}>
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
            If this helped and you want to support it directly, you can pay whatever feels right — no set price.
          </div>
          <a href={LINKS.supportPage} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: "none" }}>
            Support this project →
          </a>
        </div>

        <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          Questions about any of this? <a href="mailto:luxefulfilmentco@gmail.com" style={{ color: C.primary, fontWeight: 600 }}>luxefulfilmentco@gmail.com</a>
        </div>
      </div>
    </div>
  );
}
