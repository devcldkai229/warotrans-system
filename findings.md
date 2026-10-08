# Architectural & UI/UX Findings Log

## Source of Truth
- Prototype implementation: `/mnt/Data/Capstone Project - WaroTrans/ui-design-prototype/prototype-staff-web/src/routes/index.tsx`
- Target codebase: `/mnt/Data/Capstone Project - WaroTrans/warotrans-system/app/src`

## Key Design Principles & Tokens (Silicon Valley / Industrial Aesthetic)
1. **Color Tokens**:
   - Primary: `#005cd1` (WaroTrans Cobalt Blue)
   - Primary Dark: `#004bb0`
   - Primary Light / Soft: `rgba(0, 92, 209, 0.08)`
   - Background: `#f8fafc` (slate-50)
   - Surface / Card: `#ffffff`
   - Surface Subtle: `#f1f5f9` (slate-100)
   - Border: `#e2e8f0` (slate-200)
   - Text Primary: `#071523` (deep slate/ink)
   - Text Secondary: `#54657d` (slate-500)
   - Text Muted: `#94a3b8` (slate-400)
   - Success: `#059669` / `#10b981` (emerald)
   - Warning: `#d97706` / `#f59e0b` (amber)
   - Danger: `#dc2626` / `#ef4444` (rose)

2. **Typography Rules**:
   - Eyebrows & Codes: `fontMono`, `text-[9px] / 10px`, `fontWeight: '900'`, `letterSpacing: 1.2`, `textTransform: 'uppercase'`
   - Titles / Card Headings: `fontSans`, `fontSize: 13-16`, `fontWeight: '900'`
   - Descriptions / Subtitles: `fontSans`, `fontSize: 11-12`, `fontWeight: '500'`, `color: colors.textSecondary`
   - Metrics / Numbers: `fontSans` or `fontMono`, `fontWeight: '900'`, tabular numbers

3. **Tactile 3D Mechanics**:
   - Buttons: `borderBottomWidth: 2`, `borderBottomColor` slightly darker tone, shadow, active press `transform: [{ scale: 0.98 }]`, `opacity: 0.88`
   - Cards: `borderWidth: 1.5`, `borderColor: colors.border`, `borderRadius: 12-16`, soft ambient shadow

4. **Modals & HUDs**:
   - Backdrop: `rgba(7, 21, 35, 0.65)` with backdrop blur when available
   - Bottom Sheets: drag handle `44x5`, `borderTopLeftRadius: 20`, `borderTopRightRadius: 20`, `maxWidth: 480`
   - Viewfinder Reticles: crisp 4-corner accents, pulsating laser scan line
