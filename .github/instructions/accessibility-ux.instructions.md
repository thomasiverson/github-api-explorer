---
applyTo: "src/**/*.tsx"
---

# Accessibility & UX Preferences

## Color & Contrast
- The primary user is colorblind. Never rely on color alone to convey status.
- Use text labels, icons, or symbols alongside color indicators (e.g., `✔ Created` not just a green dot)
- For checkboxes and selected states, use high-contrast combinations: white background with colored checkmark, or bold borders — NOT colored icon on same-colored background
- Avoid green-on-green, red-on-red, or any same-hue-on-same-hue combinations
- Use Unicode characters like `✔` (heavy check) instead of emoji like `✅` (hard to see at small sizes)

## Status Indicators
- Success/pass: green text (`text-success font-medium`) with a visible `✔` and text label
- Failure/error: red text (`text-danger`) with a visible `✘` and text label — reserve red exclusively for errors
- Pending: muted text (`text-text-muted`) with an explicit "Pending" label
- Running/loading: warning text with an inline SVG spinner (`animate-spin`) and an explicit "Running" label

## Vertical Space
- Conserve vertical space — prefer single-line layouts, inline status indicators, and collapsible sections
- Put related controls (input + button + status) on the same row when possible
- Use `<details>` for supplementary info (permissions notes, help text)

## Dropdowns & Pickers
- Use explicit trigger buttons (icon buttons) instead of browser-native `<datalist>` (unreliable)
- Dropdowns must escape parent overflow containers — use `overflow: visible` on parent or fixed positioning
- Close dropdowns on outside click via `mousedown` listener with `data-*` attribute containers
- Make dropdown panels at least `w-96` (384px) so emails and usernames aren't truncated

## Enterprise / GitHub EMU Conventions
- Filter out the enterprise setup user (`{slug}_admin`) from admin login defaults — it cannot own organizations
- Default enterprise slug from `activeEnv.enterprise_slug`
- Use enterprise billing email as the default billing contact for batch operations
