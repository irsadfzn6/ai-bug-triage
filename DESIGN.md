# AI Bug Triage Engineering Console — Design Specifications (Anti-Slop)

**Theme:** Swiss Industrial Light Engineering Console  
**Typography:** Primary sans: `IBM Plex Sans` / System UI; Monospace: `JetBrains Mono` / Consolas.  
**Palettes:**
- Background: Warm Alabaster (`#F7F6F2`)
- Surface / Cards: Pure Clean White (`#FFFFFF`) with subtle 1px border (`#E5E5E0`)
- Text Primary: Deep Carbon (`#141413`)
- Text Secondary: Muted Slate (`#6B6964`)
- Accent / P0 Critical: Safety Oxide Red (`#C52828`)
- Accent / P1 High: Safety Ochre (`#D97706`)
- Accent / Validated: Signal Emerald (`#059669`)
- Accent / Dedup Lock: Deep Cobalt (`#1D4ED8`)

**Anti-Slop Discipline:**
- No arbitrary purple or neon gradients.
- High contrast, WCAG AA compliant.
- No floating cards with excessive 3D box shadows.
- Single unified console view (Bug Report Input + Correlated Trace Inspector + Live Issues Board).
