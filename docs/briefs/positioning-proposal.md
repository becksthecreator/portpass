# Positioning proposal: a new set of eyes, plus the tools

Website & Growth, 19 Nov 2026. **A proposal only. Nothing here is built or shipped.** It reverses the 19 Oct "sports, fitness and gyms only" decision, so Antonio decides before any page changes.

Antonio's brief, in his words: *"We dont want portpass to be for just sportregistration. we want it to be able to get everybusines ruuning at its most efficient version. like companies who hire consultants to fix problems in their business they have been trying to fix but it wouldnt work out, until they bring a new set of eyes."*

**Aligned with Business Ops' business plan** (section "4. The offer: diagnose, fix, run"): the site uses the plan's two phrases, **"a new set of eyes plus the tools"** and **"diagnose, fix, run"**, and describes the same three steps, so the website and the plan say one thing.

Where the site has to say it differently from the plan (house rules, not new wording):
* **Card payments.** The plan lists "card payments through the client's own merchant account" as planned. The site says only "card payments are not available yet" (rule 2).
* **"Platform".** The plan says "any business on the platform" in two places. The site says "the PortPass app".
* **"Diagnose".** The site keeps the word, glossed the first time it appears: "we look at where your time, money and customers leak".
* **Revenue share.** The site names it as a way to pay for "run", never a figure. Futprep's terms stay off the site.

Lenses: `understand-customers` (who, and what hurts), `blitz-copy` (headlines), `ig-human` (the copy below has no AI tells; its weak spot is specificity, which real Futprep numbers would fix). House rules still apply: no "platform", "solution" or "SaaS", and never say card payments work.

## 1. Who it's for (understand-customers)

**The owner of a small Bahamian business with a problem they've tried to fix and couldn't.** That's the business plan's wording. In practice it's anyone who takes bookings, chases payments and answers the same questions all day. As in the plan, we start where we have proof (sports, fitness, gyms and events) and add 2–3 more kinds of business once Antonio picks them.

* **Their nightmare:** the business runs through their phone. Bookings are in WhatsApp, payments are in a notebook or their head, and staff ask them everything. They can't take a day off, and they don't know who still owes them.
* **What they've tried:** a US booking app that wants cards in US dollars; a spreadsheet nobody updates; a cousin who "does websites"; one more hire. None of it stuck, because nobody changed how the work actually moves.
* **In their words:** "I'm always on my phone." "I don't know who paid." "Everything comes to me." "I tried that app."
* **The magic-wand outcome:** the business runs the same on a Tuesday when they're not there, and they can see in one screen who booked, who paid and what's next.
* **The belief we confirm:** the problem isn't them working harder. It's that nobody from outside has looked at how the work moves.

## 2. One breath: what we do

> A new set of eyes plus the tools: we diagnose what's stuck in your business, fix it, then run it with you.

(The plan's phrase, word for word, then the three steps in plain words. My earlier draft said "We look at how your business runs, fix what slows it down, and give you the tools to keep it fixed." I'm dropping it so there is one line, not two.)

## 3. Headline options (blitz-copy, owner-facing)

**Option 1: identity, relief.**
> **A new set of eyes for your business. Plus the tools.**
> We sit with you in Nassau, find what's been stuck for years, and fix it with tools built for cash, bank transfer and Kanoo. Then we run it with you.

*Triggers:* validation (it's not your fault), relief, belonging (local, in person).

**Option 2: pain, curiosity.**
> **Fix what's been stuck.**
> You've tried the app, the spreadsheet and the extra hire. We watch how your business really runs for a day, fix the slow parts, and run them with you on PortPass.

*Triggers:* recognition of past failures, curiosity (what did they miss?), power.

**Option 3: a concrete scene.**
> **Get your business off your phone.**
> Bookings in WhatsApp, payments in a notebook, every question coming to you at 10pm. We come in, see where the hours go, and put it in one place your staff can use.

*Triggers:* identity (that's me), relief, a specific outcome.

**Recommendation: Option 1 as the H1, with Option 3's scene as the first section under it.** Option 1 says what Antonio described, a new set of eyes, in his own frame. Option 3's scene does the persuading underneath.

## 4. How it works: diagnose, fix, run

The same three steps as the business plan, in the plan's order and scope:

1. **Diagnose.** We look at where your time, money and customers leak, and why earlier fixes didn't stick. You get a short written diagnosis and a plan. (How long it takes and what it costs are blanks in the plan too: Antonio's call.)
2. **Fix.** We set up the new way of working: the PortPass app set up for your business, your website and marketing where you need them, and your staff shown how to use it.
3. **Run.** We keep it running for you, on a monthly retainer or a share of revenue, and report to you every week. Futprep gets a Monday update.

Honest limits to print next to it: customers pay you directly (cash, bank transfer, Kanoo); card payments are not available yet; PortPass never holds your money. "Fix" covers how bookings, payments, customer messages, staff and marketing run. It does not cover accounting, payroll or tax advice.

How the site shows the price: as "a monthly retainer or a share of revenue, agreed after the diagnosis". No figures until Antonio confirms them; the plan's setup prices are still drafts.

## 5. Proof: the Futprep case study

> Futprep Athletics runs its kids' football in Lyford Cay on PortPass. Parents register in three taps, the owner sees who has paid on one screen, and staff sign in to the desk with a PIN.

These are facts from the build (`docs/ops/STATE.md`). The business plan adds:
* **The before:** registrations, payments and parent messages ran over WhatsApp groups.
* **The case:** it is "the first full diagnose → fix → run case". PortPass runs Futprep's programmes, marketing and rebrand on a retainer, agreed in principle on 14 Nov 2026.

So the case study can read: *"Futprep ran registrations, payments and parent messages through WhatsApp groups. We diagnosed it, moved it onto PortPass, and now run the programmes with them."* The deal terms stay off the website.

Still needed, with Futprep's OK:
* **One number:** Term 2 sign-ups, after 7 Dec. The plan has the same blank.
* **One quote** from Futprep's owner.

Without them the case study is a description, not proof.

## 6. What changes, page by page (when approved)

| Where | Today | Proposed |
| --- | --- | --- |
| **Home** (`app/HomeHero.tsx`, `app/page.tsx`) | "Sports and fitness in The Bahamas." Written for parents and owners at once; counters show 1 business | Owner-first hero (Option 1), the three steps, the Futprep case study, one button: "Book a diagnosis". Parents get a small "Looking for a class? See what's open" link. Counters hidden until 3+ live businesses |
| **/business** | "Your bookings and payments in one place, not lost in WhatsApp." A tool pitch | Becomes the long version: the owner's day today, diagnose / fix / run, what "fix" covers and doesn't, Futprep, FAQ |
| **/pricing** | Monthly plans only | Adds the diagnosis (price is Antonio's call) and "Run: a monthly retainer or a share of revenue, agreed after the diagnosis". The app plans stay for businesses that only want the tools |
| **Menu** (`app/_components/SiteNav.tsx`) | "Browse" first, by category | "For businesses" first. Browse stays, but shows only sections with a live business (rule 7) |
| **Hidden sections** (Admin → Sections; redirects in `next.config.ts`) | Everything but Sports & Fitness hidden since 19 Oct | Un-hide a section only when a business in it goes live. Market, Shop, Sell and Order stay redirected; that is a separate decision |
| **/about** | "Built in Nassau, for Bahamian businesses." Booking-tool description | The founders and why: two brothers who fix how local businesses run |
| **Site title, description, share card, app manifest** | "Sports clubs, coaches and gyms in The Bahamas…" | Owner-facing line from section 2 |
| **/terms** | v3 (in #257): "sports, fitness and gym businesses" | v4: any local business. If the "look" becomes a paid service, the attorney adds a services clause |

## 7. What assumes "sports only" today

**Docs:**
* `docs/ops/STATE.md`: the 19 Oct banner ("PortPass is sports, fitness and gyms only"), and the `feat/sports-only` row and note.
* `CLAUDE.md`: no "sports only" line. Its first line ("a booking platform for Bahamian businesses") uses a word the copy rules ban; HQ owns that file.
* Briefs: `docs/briefs/website-growth-plan.md` and the #257 report describe the sports-only site.

**Code (copy and metadata):**
* `app/layout.tsx:14–15`: site title and description, "Sports clubs, coaches and gyms in The Bahamas…"
* `app/manifest.ts:13`, the app description.
* `app/opengraph-image.tsx:11`, the share card ("Sports and fitness in The Bahamas.").
* `app/HomeHero.tsx:34,37`, the H1 and lede.
* `app/about/page.tsx:32`, "A sports club, coach or gym lists what it offers".
* `app/terms/page.tsx` (v3 in #257), "What PortPass is".
* `app/sports-fitness/notify/page.tsx:27`, "More sports and fitness is on the way."
* `app/page.tsx`, the "If you're booking" steps and the Open now strip (built around Futprep's classes and camps).

**Code (behaviour):**
* `next.config.ts:115–132`: the 19 Oct redirects (weddings to their own domain; Market, Shop, Sell and Order to home).
* The `categories` table: all sections but Sports & Fitness hidden (`is_visible`), read by `db/categories.ts` and the menu.
* `lib/scout/places.ts`: Scout's lead searches are sports queries ("football academy Nassau").
* `app/sitemap.ts`: lists only sections with a live business. Already right for any sector.

## 8. Risks

* **Spreading thin again.** The 16 Oct growth plan ("cash first, in the wedge") narrowed to sports for a reason. Suggestion: say "any business" on the site, but sell to 2 or 3 kinds of business first, with sports staying the proof.
* **Founder time.** "Diagnose" and "run" are hours from Antonio and Adon. Price them, or cap how many new businesses a month.
* **Promises.** "Fix" must stay inside what PortPass does. No card payments, no holding money, no accounting.
* **Rule 5.** Outreach for the new pitch stays one to one and by hand. No bulk messages.

## 9. Questions for Antonio

1. Which 2 or 3 kinds of business do we sell to first, besides sports?
2. The diagnosis: what it includes, how long it takes, and its price (BSD). The business plan has the same blank.
3. Is accounting, payroll and tax advice out of "fix"? (The plan puts the website and marketing in.)
4. Headline: Option 1, 2 or 3?
5. Futprep: the "before", one number and one quote, and their OK to be named as the case study.
6. Can Weddings By The Sea be a second example (it runs on PortPass under its own domain), or does it stay separate?
7. When this is approved: does `STATE.md`'s 19 Oct banner get replaced, and who updates `CLAUDE.md`?
