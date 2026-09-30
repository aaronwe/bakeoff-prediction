# Weekly email formatting

Spec (from user): (1) intro note must keep line breaks and support full Markdown; (2) "Submit your predictions" link big, bold, with "!"; (3) standings use competition ranking for ties (1,2,2,2,2,2,7,7,9,10 style: tied players share the rank, next rank skips).

Global constraints: use `scripts/.venv`-free Node (`cd scripts && npm test`, vitest). Player names/prompts stay HTML-escaped. Intro note is admin-authored but raw HTML in it must NOT pass through unescaped. Also plain-text alternative is produced in `scripts/send-weekly-email.mjs` via `html.replace(/<[^>]+>/g,'')` — keep it working (line breaks should survive reasonably).

## Task 1: email template changes (single task)
Files: `scripts/lib/emailTemplates.mjs`, new `scripts/lib/emailTemplates.test.mjs`, `scripts/package.json` (+lock) to add `marked`, `web/src/pages/admin/AdminEpisode.copy.js` (label mention "Markdown supported").
- Render `episode.intro_note` with `marked` (gfm, breaks: true so single newlines become <br>). Escape raw HTML in the source first (or override the html renderer to escape) so `<script>` is shown as text. Blank intro -> nothing.
- CTA: `<p style="font-size:24px;font-weight:bold;margin:24px 0"><a href="SITE" style="font-weight:bold">Submit your predictions!</a></p>` (inline styles for email clients).
- Leaderboard: add exported `rankRows(rows)` (rows sorted desc by total) returning rows with `rank` using competition ranking. Render as a `<table>` or `<p>` list with explicit rank numbers e.g. `2. Karen: 4` (not `<ol>`, since <ol> can't show ties); keep `T2.`-style out — plain "2." for each tied player.
- Tests (TDD): ties example from the user (5,4,4,4,4,4,3,3,2,0 -> ranks 1,2,2,2,2,2,7,7,9,10), markdown bold + newline/paragraph rendering, raw HTML escaped, CTA text/style, existing behavior (empty leaderboard, escaping names).
- Update the intro textarea label copy to say Markdown is supported.
Commit with message "Format weekly email: markdown intro, bigger CTA, tie-aware standings".
