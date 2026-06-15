## Goal
Rewrite the landing page copy to:
1. Lead with the sharp promise: "Find qualified materials and prove compliance in seconds."
2. Make the problem emotionally resonant — how it feels to waste hours hunting specs and proof.
3. Speak directly to all three audiences: engineers, procurement, and compliance teams.
4. Surface concrete time and cost savings in the metrics section.
5. Keep the solution framing tight: searchable material intelligence for specs, certs, inventory, and vendors.

## Scope
This is a **copy-only change** — no new components, no layout changes, no visual redesign. We update:
- `src/lib/landingContent.ts` — default copy values and section labels
- `src/pages/Landing.tsx` — hardcoded strings in problem cards, platform bullets, feature bullets, procurement bullets, metrics, and demo bullets

## Section-by-section changes

### Hero
- **Eyebrow**: Shift from generic "Built for..." to an authority/speed signal.
- **Title**: Lead with "Find qualified materials and prove compliance in seconds." (single-line or split for rhythm).
- **Body**: Lead with the feeling — "You shouldn't spend half your week hunting PDFs..." — then pivot to Traceium as the answer.
- **CTAs**: Keep "Book a demo" primary; secondary becomes "See how it works".
- **Trust badges**: Add "Compliance-ready" to speak to the compliance audience.

### Problem
- **Eyebrow**: "Does this sound familiar?"
- **Title**: Make it visceral — e.g. "Hours disappear. Deadlines don't."
- **Body**: Lead with the feeling of time wasted, then the mechanics.
- **Cards**: Rewrite the three hardcoded problem cards to hit each audience:
  1. Engineers: "You know the right material exists. Finding it takes an afternoon."
  2. Procurement: "You re-request the same quotes every program."
  3. Compliance: "Every audit is a scavenger hunt across drives, emails, and binders."

### Platform
- **Eyebrow**: "The solution"
- **Title**: Tighten to the platform's role — "One searchable system for every material, cert, and vendor."
- **Body**: Focus on searchable intelligence, not just ingestion.
- **Bullets**: Keep the six feature cards but sharpen descriptions to emphasize speed and compliance.

### Features (Engineer)
- **Eyebrow**: Keep "For engineers"
- **Title**: Tie to the core promise — "Find the right material in seconds."
- **Body**: Lead with the frustration of guessing, then the seconds-to-answer payoff.
- **Bullets**: Sharpen to concrete outcomes.

### Procurement
- **Eyebrow**: "For procurement"
- **Title**: Lead with speed/savings — e.g. "Cut procurement cycles from weeks to hours."
- **Body**: Emphasize aggregated demand and fewer emails.
- **Bullets**: Tie each to a concrete saving.

### Metrics / Social Proof
- Rewrite the four hardcoded metrics to show concrete time/cost savings:
  1. "200+" → keep, or shift to "Days → seconds" type framing
  2. "10x faster" → strengthen to a hours-saved claim
  3. "1 email per vendor" → quantify the time/effort saved
  4. "100% audit-ready" → reframe as compliance confidence

### Demo CTA
- **Eyebrow**: Keep the urgency signal.
- **Title**: "See Traceium against your real materials list."
- **Body**: Emphasize we'll show you the time you could be saving.
- **Form bullets**: Keep but tighten.

## Files to edit
1. `src/lib/landingContent.ts` — all default copy strings
2. `src/pages/Landing.tsx` — hardcoded strings in problem cards, platform bullets, feature bullets, procurement bullets, metrics, demo bullets, and nav/footer if needed

## Not in scope
- No new sections or layout changes
- No new images, video, or components
- No DB or backend changes
- No changes to the LandingEditor admin UI (it reads from the same keys)