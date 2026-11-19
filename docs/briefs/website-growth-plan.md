# Website & Growth plan, 19 Nov 2026

From the read-only audit of portpassbahamas.com on 19 Nov. Three lenses, kept light:

* **seo-roast:** fatal first. Anything that puts wrong words in the page Google and AI search read beats anything cosmetic.
* **impeccable:** the home page is a *Persuade* surface. A visitor who can't tell who it is for in five seconds leaves.
* **blitz-copy:** lead with the reader (the owner), not the product. One concrete outcome per line.

House rules still win over the lenses: no "platform", "solution" or "SaaS"; never imply card payments work; plain local copy; 375px first.

Scope: home, /about, /pricing, /terms, /privacy, /business, /demo, /apply and the category pages. Not Futprep's pages or registration (Engineering).

## Must fix (1–3): one small PR, opened 19 Nov

| # | Problem | Why it is first | Fix in the PR |
| --- | --- | --- | --- |
| 1 | Card payments described three ways: "card once our licensed partner is live" and "Coming soon" (/pricing), "does not take card payments" (/about, /terms), "coming soon with a licensed partner" (/business) | Rule 2. "Coming soon" reads as a promise, and three versions read as nobody knowing. | One line everywhere: **"Cash and bank transfer work today. Card payments are not available yet."** /business keeps Kanoo wallet transfers, which payment requests really support. /privacy keeps "does not take card payments, and we never collect or store card numbers": it is a privacy fact, not a sales line, and it agrees. |
| 2 | Weddings still named: /terms ("wedding services", "such as a wedding enquiry"), the home "How it works" step ("sessions, ceremonies, venues"), robots.txt (`/weddings/admin`, `/weddings/staff`) | PortPass is sports, fitness and gyms only since 19 Oct. Search engines and AI answers still read PortPass as a wedding site. | /terms says sports, fitness and gym businesses (Terms **version 3**, changelog in `lib/legal.ts`). Home step reads "classes, camps, sessions". On portpassbahamas.com every `/weddings` path already redirects to bahamasweddingsbythesea.com, so the two robots lines are dead there; they move to that domain's robots.txt, which until now allowed everything, staff desk included. /privacy's wedding lines stay: they disclose the WeddingWire badges and enquiries on the BWS site PortPass still runs. |
| 3 | Loading words ("Loading", "A business on PortPass", "A line about what is on and when it runs") in the server HTML of home, /sports-fitness and /sports-fitness/football-soccer | seo-roast fatal tier: text-only crawlers and AI tools read the fallback, not the cards streamed in after. | The skeleton keeps its exact boxes, but the words move to a `data-sk` attribute drawn by CSS, so they are never page text. The skeleton's own "Open now on PortPass." heading becomes a box too, which also removes one of the two "Open now" H2s from the HTML. |

## Should fix (ranked by money)

1. **Home says who it is for** (impeccable, blitz-copy). See the rewrite below. Hide the counters ("1 Business open · 1 Category open · 1 Camp open") and "One is open right now" until there are at least 3 live businesses; with one, they advertise emptiness. One "Open now" H2, not two.
2. **Canonical tags on home, /about, /apply** (seo-roast revenue tier, under an hour). Only /pricing has one. Add `alternates.canonical` to each page's metadata.
3. **Trust block on /about and the footer.** Company name (PortPass Bahamas Technologies, already in /terms), registration number, a Nassau address or P.O. Box, and an email on the company domain instead of the Outlook address in `lib/contact.ts`. Needs Antonio's answers (below).
4. **The VAT answer on /pricing.** "Prices are in BSD." answers a different question. Antonio said in October that PortPass is not VAT-registered; the wording is his to approve (below).
5. **/demo vs /business promise.** /demo and /demo/home say "Sign up in 30 seconds" (linking to /own, the OWN Conference sign-up); /business says "We build it for you". Pick one: "We build your page for you. You check it and say go." The 30-second line can stay on /own, where it is an event offer.
6. **Coming-soon categories.** Six are in the menu but `noindex`. Either take them out of the menu until each has a live business (rule 7's spirit), or keep one "Coming next" link to a single page. A menu full of dead ends costs trust more than it earns.
7. **Titles.** Two pages share "Kids Football Classes in Nassau…". Give /sports-fitness/football-soccer the category title and Futprep's page the business title (Futprep's page is Engineering's; agree the split with them).
8. **"Carv Performance Coming soon" on /sports-fitness.** A drafted business shown as a card to the public. Hide it until it has a price (rule 7) or show it only in the "What's coming" panel.
9. **Old lines still public: /perks, /guides, /where-to, /pass.** PortPass no longer sells them. Redirect or noindex them, and drop /guides from the sitemap. New or removed pages are Antonio's call (below).
10. **Sitemap `lastModified`.** Only /privacy, /terms and /guides carry one. Add it to business and category entries from their `updated_at` (low value; do it when touching the sitemap for 9).

Fluff, after all of the above: alt text checks, meta description lengths, heading order on the legal pages.

## Home page rewrite proposal (aimed at business owners)

Today: H1 "Sports and fitness in The Bahamas." It speaks to parents and owners at once, and says nothing about what PortPass does.

Proposal: the hero speaks to the **owner**; parents get a clear second door ("Looking for a class? See what's open →") just below.

**Option A (relief, validation):**
> **Your bookings, out of WhatsApp.**
> Sports clubs, coaches and gyms in The Bahamas: one link with your prices and a booking button. Parents book, you see who paid. We build the page for you.
> [Get your page] · Looking for a class? See what's open →

**Option B (identity, specific outcome):**
> **Run your club, not your inbox.**
> PortPass gives Bahamian sports, fitness and gym businesses one page to take registrations and track cash and bank transfer payments. Futprep Athletics runs its classes on it today.
> [Get your page] · Looking for a class? See what's open →

Both: no "platform", no card promise, a real named business as proof (Futprep is live and public), and the primary button in `--signal` red. Recommend **A**: shorter, and it names the pain every owner in the Handbook interviews brought up (WhatsApp back-and-forth). Needs Antonio's pick before any code.

## Questions only Antonio decides

1. **Email:** can we get an address on the company domain (for example hello@ at portpassbahamas.com) to replace the Outlook address on the site?
2. **Company details:** the registration number and the address (street or P.O. Box) to show on /about and in the footer.
3. **VAT:** OK to say on /pricing "PortPass is not VAT-registered, so no VAT is added to our fees. Prices are in Bahamian dollars"?
4. **Terms version 3:** the PR publishes Terms v3 (sports, fitness and gyms; the card line). New accounts will record v3. OK, or wait for the attorney's wording?
5. **Old pages:** redirect /perks, /guides, /where-to and /pass to home, or keep them up but hidden from search?
6. **Coming-soon categories:** take them out of the menu, or keep a single "Coming next" link?
7. **Home headline:** A or B?
8. **The growth plan's "no new PRs until the fifth paid invoice":** this PR was asked for by HQ on 19 Nov. Confirm the should-fix list can follow as small PRs, or park it.
