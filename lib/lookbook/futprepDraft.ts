// The Futprep look book, draft 1. A placeholder until PortPass Site Design
// hands over the designed page, which replaces FUTPREP_LOOKBOOK_HTML whole.
// Rules for whatever goes in here: no children's names, health, pickup or
// emergency details (CLAUDE.md rule 3), no prices that aren't confirmed,
// nothing that says card payments work, and no links that carry the key.

export const FUTPREP_LOOKBOOK_TITLE = "Futprep look book · Draft 1";

export const FUTPREP_LOOKBOOK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>${FUTPREP_LOOKBOOK_TITLE}</title>
<style>
  :root{--ink:#0b2a3c;--deck:#f4f6f8;--signal:#d7262e;--harbour:#1f5fa8;--muted:#5b6b78}
  *{box-sizing:border-box}
  body{margin:0;background:var(--deck);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:720px;margin:0 auto;padding:48px 16px 64px}
  .eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--harbour);margin:0 0 12px}
  h1{font-size:clamp(32px,8vw,56px);line-height:1.05;letter-spacing:-.02em;margin:0 0 16px}
  p{margin:0 0 16px;color:var(--muted)}
  .card{background:#fff;border:1px solid #dfe5ea;border-radius:16px;padding:20px;margin-top:24px}
  .card strong{color:var(--ink)}
</style>
</head>
<body>
<main>
  <p class="eyebrow">PortPass × Futprep Athletics</p>
  <h1>The Futprep look book.</h1>
  <p>This is the first draft of the look book, made for Alex to go through. The designed pages are on their way and will appear at this same link.</p>
  <div class="card"><p><strong>Draft 1.</strong> Nothing here is final. Tell Antonio what you'd change.</p></div>
</main>
</body>
</html>`;
