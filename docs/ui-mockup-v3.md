# LightTrack v3 – UX/UI Mockup (Implementation-Ready)

This mockup keeps the current Electron footprint but gives the app a distinct, opinionated look with strong hierarchy, purposeful typography, and mobile-responsive layout.

## Design Principles
- Typeface: `Space Grotesk, "Segoe UI", system-ui` for headings and numbers; `IBM Plex Sans, "Segoe UI", system-ui` for body copy. Bold numerals give timers/charts weight.
- Color system (CSS vars):
  - `--bg-0: #0b1020`, `--bg-1: #11182a`, `--bg-2: #192138`
  - `--ink-0: #e9eef5`, `--ink-1: #c5cfdd`, `--ink-muted: #8c99af`
  - `--accent: #1ad1a5`, `--accent-2: #00a8e8`, `--warn: #f6c343`, `--danger: #f26b6b`
  - Elevation uses layered shadows (`0 10px 30px rgba(0,0,0,0.25)`).
- Layout grid: 12-column on desktop, collapses to stacked cards on ≤960px. Safe-area padding 24px desktop / 16px mobile.
- Motion: 180ms ease-in-out for hover; 260ms springy fade/slide for modal/palette; staggered list entrance for activity feed.

## Shell Layout (Desktop)
- Left rail (64px): icon-only nav (Timer, Timeline, Analytics, Projects, Settings). Active state uses accent bar + glow ring.
- Secondary sidebar (280px): filters/date range, saved views, quick tags. Collapsible to 72px with tooltips.
- Content area: tab bar (Dashboard | Timeline | Analytics | Rules | Settings), then scrollable panels.
- Status strip (32px): tracking status, autosave, extension link, shortcuts hint.

## Key Screens
### Dashboard
- Hero card (12-col): live timer with big digits, project pill, app/source, quick actions (Start/Stop, Add manual, Toggle floating timer).
- KPI row (4 cards): Today total, Billable vs Non-billable, Focus quality, Breaks avoided.
- Activity feed (8 cols): virtualized list grouped by hour; badges for project/tags; inline edit/delete; keyboard focus states.
- Right rail (4 cols): Focus score sparkline, Goals progress rings, Upcoming meetings detected from titles.

### Timeline
- Horizontal 24h lane with colored blocks per project; zoom scrubber; tooltips show window title + URL.
- Idle gaps shown as translucent stripes with “mark as work/break” CTA.
- Context menu: split/merge, reassign project, set billable, add note.

### Manual Entry / Edit Drawer
- Right-side drawer (420px) slides over content.
- Fields: Project (typeahead + recent), Description, Tags, Start/End with smart presets, Billable toggle, Source (manual/browser/app), Ticket link.
- Preview chip shows computed duration; conflict warnings inline.

### Analytics
- Time distribution sunburst, trend lines (week/month), context-switch count, average session length, top apps.
- Filters persist per user (stored in `electron-store`).
- Export CTA (CSV/JSON) with “Copy chart as PNG” micro action.

### Settings
- Sections: Tracking (sampling, idle rules), Data (retention, backup/export), Appearance (theme density, type scale), Shortcuts, Integrations.
- Each section uses cards with primary/secondary text and toggle or slider on the right.

## Interaction & A11y
- Keyboard: `Ctrl/Cmd+K` command palette; `Ctrl/Cmd+E` focus filter; arrow keys navigate lists; `Enter` opens drawer.
- Focus-visible outlines with 3px accent; 44px min touch targets.
- Reduced motion preference: disable stagger/slide, keep opacity-only.

## Component Sketch (pseudocode)
```html
<main class="page">
  <header class="topbar">
    <div class="brand">LightTrack</div>
    <div class="filters"><date-picker /><pill>Week</pill><pill>Billable</pill></div>
    <button class="ghost" aria-pressed="false">Floating timer</button>
  </header>
  <section class="hero card">
    <div class="timer">02:14:08</div>
    <div class="meta">Project: Phoenix API • App: VS Code • Sampling: 10s</div>
    <div class="actions">
      <button class="solid danger">Stop</button>
      <button class="ghost">Add manual</button>
      <button class="ghost">Mark break</button>
    </div>
  </section>
  <section class="grid">
    <kpi-card title="Today" value="6h 42m" delta="+12%" />
    <kpi-card title="Billable" value="78%" sub="5h 12m" />
    <kpi-card title="Focus quality" value="86" sub="3 sessions" />
    <kpi-card title="Breaks avoided" value="2/4" />
  </section>
  <section class="split">
    <activity-feed />
    <insight-rail />
  </section>
</main>
```

## Responsive Notes
- On tablets/mobile: collapse sidebars, move filters into a top sheet, swap timeline to vertical stacked blocks, floating timer becomes pill at bottom.
- Use CSS container queries on cards to switch KPI layout (2-up → 1-up).

## Implementation Handoff
- Apply CSS tokens in `src/renderer/styles/app.css`; keep DOM simple (cards, rails, drawer). Use `prefers-color-scheme` to allow optional light mode later.
- Prefer SVG icons bundled locally; avoid remote fonts in production, ship variable font files in `assets/fonts` with `font-display: swap`.
- Keep CSP strict: no inline scripts; use hashed inline styles only for preload fade animations.
