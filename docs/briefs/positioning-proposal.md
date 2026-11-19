# Positioning proposal: a new set of eyes, plus the tools

Website & Growth, 19 Nov 2026. **A proposal only. Nothing here is built or shipped.** It reverses the 19 Oct "sports, fitness and gyms only" decision, so Antonio decides before any page changes.

Antonio's brief, in his words: *"We dont want portpass to be for just sportregistration. we want it to be able to get everybusines ruuning at its most efficient version. like companies who hire consultants to fix problems in their business they have been trying to fix but it wouldnt work out, until they bring a new set of eyes."*

Lenses: `understand-customers` (who, and what hurts), `blitz-copy` (headlines), `ig-human` (the copy below has no AI tells; its weak spot is specificity, which real Futprep numbers would fix). House rules still apply: no "platform", "solution" or "SaaS", and never say card payments work.

## 1. Who it's for (understand-customers)

**The owner of a small Bahamian business who is the bottleneck.** Gyms, clubs, coaches, salons, tour and boat operators, cleaners, tutors, caterers: anyone who takes bookings, chases payments and answers the same questions all day.

* **Their nightmare:** the business runs through their phone. Bookings are in WhatsApp, payments are in a notebook or their head, and staff ask them everything. They can't take a day off, and they don't know who still owes them.
* **What they've tried:** a US booking app that wants cards in US dollars; a spreadsheet nobody updates; a cousin who "does websites"; one more hire. None of it stuck, because nobody changed how the work actually moves.
* **In their words:** "I'm always on my phone." "I don't know who paid." "Everything comes to me." "I tried that app."
* **The magic-wand outcome:** the business runs the same on a Tuesday when they're not there, and they can see in one screen who booked, who paid and what's next.
* **The belief we confirm:** the problem isn't them working harder. It's that nobody from outside has looked at how the work moves.

## 2. One breath: what we do

> We look at how your business runs, fix what slows it down, and give you the tools to keep it fixed.

## 3. Headline options (blitz-copy, owner-facing)

**Option 1: identity, relief.**
> **A new set of eyes for your business.**
> We sit with you in Nassau, find what's been stuck for years, and fix it with tools built for cash, bank transfer and Kanoo. Then we keep it running with you.

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

## 4. How it works: we look, we fix, we run it on PortPass

1. **We look.** We spend a day in your business and write down where the hours and the money go.
2. **We fix.** We set up what's missing on PortPass: your page, bookings, registration, payment requests, staff logins, your price list and your customer list. Then we show your staff how to use it.
3. **We run it with you.** Once a month we sit down with your numbers and change what isn't working.

Honest limits to print next to it: customers pay you directly (cash, bank transfer, Kanoo); card payments are not available yet; PortPass never holds your money. "Fix" means how bookings, payments and customer records move. It does not mean accounting, payroll, HR or tax advice.

## 5. Proof: the Futprep case study

> Futprep Athletics runs its kids' football in Lyford Cay on PortPass. Parents register in three taps, the owner sees who has paid on one screen, and staff sign in to the desk with a PIN.

These are facts from the build (`docs/ops/STATE.md`). The page needs Antonio to fill in, from Admin and with Futprep's OK:
* **Before:** how registrations and payments were handled before PortPass.
* **One number:** for example, registrations in Term 1, or the share paid before the first session.
* **One quote** from Futprep's owner, used with permission.

Without them the case study is a description, not proof.

## 6. What changes, page by page (when approved)

| Where | Today | Proposed |
| --- | --- | --- |
| **Home** (`app/HomeHero.tsx`, `app/page.tsx`) | "Sports and fitness in The Bahamas." Written for parents and owners at once; counters show 1 business | Owner-first hero (Option 1), the three steps, the Futprep case study, one button: "Book a first look". Parents get a small "Looking for a class? See what's open" link. Counters hidden until 3+ live businesses |
| **/business** | "Your bookings and payments in one place, not lost in WhatsApp." A tool pitch | Becomes the long version: the owner's day today, look / fix / run, what "fix" covers and doesn't, Futprep, FAQ |
| **/pricing** | Monthly plans only | Adds the first look (free or priced: Antonio's call) and what the monthly plan includes once we've fixed things. Plans stay; no fee is taken from customers' payments |
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
* **Founder time.** "We look" and "we run it with you" are hours from Antonio and Adon. Price them, or cap how many new businesses a month.
* **Promises.** "Fix" must stay inside what PortPass does. No card payments, no holding money, no accounting.
* **Rule 5.** Outreach for the new pitch stays one to one and by hand. No bulk messages.

## 9. Questions for Antonio

1. Which 2 or 3 kinds of business do we sell to first, besides sports?
2. Is the first look free, or priced? If priced, how much (BSD)?
3. What does "we fix" include, and what is out (accounting, payroll, marketing)?
4. Headline: Option 1, 2 or 3?
5. Futprep: the "before", one number and one quote, and their OK to be named as the case study.
6. Can Weddings By The Sea be a second example (it runs on PortPass under its own domain), or does it stay separate?
7. When this is approved: does `STATE.md`'s 19 Oct banner get replaced, and who updates `CLAUDE.md`?
