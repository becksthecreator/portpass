# Website must-fix (1–3): report

From the Website & Growth plan of 19 Nov ([plan](website-growth-plan.md)). One PR, `feat/website-must-fix`. Not merged.

## What changed
1. **One card line.** "Card payments are not available yet", next to "cash and bank transfer work today", on /pricing (the plans note and the FAQ, which said "Coming soon"), /about, /business (the pricing note and the FAQ) and /terms. /privacy is unchanged: its "does not take card payments, and we never collect or store card numbers" is a privacy fact and agrees.
2. **Weddings out.** /terms describes sports, fitness and gym businesses and its enquiry example is a gym membership (Terms version 3 in `lib/legal.ts`, with a changelog entry). The home "If you're booking" step reads "classes, camps, sessions". portpassbahamas.com's robots.txt no longer lists `/weddings/admin` and `/weddings/staff` (those paths redirect off the domain); bahamasweddingsbythesea.com's robots.txt now keeps out its staff desk, admin and `/api`, which it allowed before.
3. **No loading words in the HTML.** The skeleton cards keep their boxes, but their words live in `data-sk` and CSS draws them, so "Loading" and "A business on PortPass" are not page text. The skeleton's "Open now on PortPass." heading is a box too.

## Files
`app/_components/motion/Skeleton.tsx`, `lib/motion/public.css`, `app/robots.ts`, `app/page.tsx`, `app/terms/page.tsx`, `lib/legal.ts`, `lib/legal.test.ts`, `app/pricing/page.tsx`, `app/about/page.tsx`, `app/business/page.tsx`, `docs/briefs/website-growth-plan.md`, this report, `docs/ops/STATE.md`.

## Migrations and env vars
None.

## Decisions
* Terms go to version 3, not an edit of version 2: `lib/legal.ts` says the version a person agreed to always names the wording, and its test ties the newest changelog date to `updated`. New accounts record v3. Antonio confirms before merge.
* /privacy keeps its wedding lines: they disclose the WeddingWire badges and wedding enquiries on the BWS site PortPass still runs.

## Tests run
See the PR body.

## For Antonio
The questions are at the end of the [plan](website-growth-plan.md).
