# Screenshots — capture plan

Six screenshots are what Devpost actually shows in the gallery — pick them
deliberately, in the order they tell the story.

> File names below are what to save under `docs/screenshots/` after the
> deploy is live. Keep the originals at native resolution (1920×1080)
> and let Devpost rescale.

| # | File | Surface | What's in frame |
|---|---|---|---|
| 1 | `01-cold-open.png` | `/` (full viewport) | Hero line — "Mnemos remembers what you forget — and acts on it." — at rest, after the rise animation lands. Top bar pulse dot vermilion. Three tiles below. |
| 2 | `02-cmd-k.png` | `/` with ⌘K palette open | Vermilion `?` glyph at the top of the palette, six nav commands listed, focused on the input |
| 3 | `03-reasoning-stream.png` | `/ask` mid-stream | Stream showing 2 thoughts, 1 vermilion `→ tool_call`, 1 saffron `← observation`, live caret on a thought. Run id chrome in the top-right. |
| 4 | `04-approval-card.png` | `/ask` with ApprovalCard rendered | The `draft email · proposed` card with vermilion left-border, attendees + subject + body visible, three buttons at the bottom |
| 5 | `05-briefing.png` | `/briefings/[id]` rendered | The 1-pager with all four sections visible — Attendees / Open threads / Outstanding commitments / Suggested talking points — citation chips at the bottom |
| 6 | `06-commitments.png` | `/commitments` "you owe" tab | Four headline stats on top, the per-row ledger with directional badges (vermilion outgoing / saffron incoming) below |

## Capture procedure

1. Run the production build locally first to confirm fidelity:
   ```bash
   npm run build:web && npx next start --dir apps/web -p 3000
   ```
2. Browser at 1920×1080, dark mode, Chrome / Arc, zoom 100 %.
3. Use built-in screenshot tools — *not* the OS one (avoid the menu bar).
   In Chrome: ⌘⇧P → "capture full size screenshot".
4. For the ⌘K palette and ApprovalCard shots, capture *while* the
   interaction is on-screen — don't dismiss between captures.
5. Trim to viewport — Devpost previews are roughly 16:10, so leave a
   little headroom on top and bottom.

## Aspect rule

Every shot should land on a hero element with at least 40 % of the frame
empty / chrome. The brief is editorial — don't compose like a SaaS
dashboard.

## Naming + storage

- Save originals to `docs/screenshots/01-cold-open.png` etc.
- Upload to Devpost in the order numbered above.
- Reuse #1 (cold open) as the Devpost cover image — it's the strongest
  single frame for the gallery thumbnail.

## After-record reuse

The same six frames also make natural section dividers for the GitHub
README. Once shot, add them to the README under the "What it does" table:

```md
![Cold open](docs/screenshots/01-cold-open.png)
![Reasoning stream](docs/screenshots/03-reasoning-stream.png)
![The wedge — approval inline](docs/screenshots/04-approval-card.png)
![Briefing 1-pager](docs/screenshots/05-briefing.png)
```

Skip 02 (palette) and 06 (commitments) from the README — they read as
chrome and pull focus from the wedge.
