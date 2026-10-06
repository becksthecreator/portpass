# Motion on the public site

Brief 22 (6 Oct 2026). PortPass should feel motion designed: smooth scroll reveals, a few big moments, still fast on a phone. This page is the whole system: the tokens, the rules, how an effect is added and how it is tested. Scope: the public site and the homepage. Business pages, booking and registration, sign-in, `/account`, `/business/*`, `/admin/*` and anything about money never move.

## The tokens

`lib/motion/tokens.css`, loaded by the root layout on every page. Every animation and transition takes its time and curve from here; none writes a number of its own.

| Token | Value | Used for |
| --- | --- | --- |
| `--dur-step` | 60ms | one step of a stagger: `calc(var(--dur-step) * n)` |
| `--dur-flap` | 60ms | one flicker of a Departure Board cell |
| `--dur-badge-step` | 90ms | one step of the Bounce Badges' stagger |
| `--dur-press` | 100ms | a card's press on a touch screen |
| `--dur-fast` | 150ms | a quick fade |
| `--dur-squish` | 180ms | a Squish Button's press and spring back |
| `--dur-menu` | 200ms | a menu or sheet opening |
| `--dur-base` | 300ms | a card lifting, a chip, a cross-fade between pages |
| `--dur-pop` | 550ms | a Bounce Badge popping in |
| `--dur-slow` | 600ms | a scroll reveal |
| `--dur-hero` | 900ms | the hero's own entrance |
| `--dur-board` | 900ms | the Departure Board's flicker before it settles |
| `--dur-sun` | 1600ms | the Sun Drift, once |
| `--dur-failsafe` | 2.5s | how long a held reveal waits for its script before it shows anyway |
| `--dur-drift` | 20s | the hero photo's slow drift, the one looping animation |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | arrives and settles: reveals, menus, anything entering |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | leaves and returns: a condensing header, a colour ease |
| `--ease-linear` | `linear` | constant speed: a line drawn with the scroll, a board cell's fold, a held reveal's failsafe |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | overshoots and springs back: Bounce Badges, Squish Buttons and the Pass Stamp only, never near money, a child's details, sign-in or admin |

Staggers step `--dur-step` apart and never stagger more than six children. The look is "Harbour Motion": playful where it is free, precise where it is serious. Public discovery pages get a little mischief; anything near money, children or sign-in stays still.

## The rules

1. **Speed is the product.** Lighthouse mobile performance on `/` stays at or above 85 (brief 03's number); CLS stays under 0.05. Report both before and after. If an effect drops either, fix the effect, not the target.
2. **Move only `transform` and `opacity`.** Never width, height, top, left, margin or box-shadow. Zero layout shift. The brief names two exceptions, neither of which moves anything: the How-it-works line's `stroke-dashoffset` and the Departure Board's character swap.
3. **Never hide the first screen behind an animation.** The hero headline, the hero image (the largest paint) and its two buttons are visible and clickable without waiting for any script. Motion may enhance them; it may not gate them.
4. **Reduced motion is a first-class mode.** `@media (prefers-reduced-motion: reduce)` turns every animation, transition and scroll effect off and shows the final state. It is tested, not assumed.
5. **CSS first.** Transitions, `@keyframes`, scroll-driven animations inside `@supports`, the View Transitions API. Where a browser lacks one, the page shows the end state. A library only if truly needed (`motion` with `LazyMotion` and `domAnimation`, its KB cost reported). No GSAP, no Lottie, no video backgrounds, no sound, no autoplay media.
6. **Phone first.** Every effect works at 375px on a mid-range Android, tested with the CPU slowed 4x. Anything off-screen is paused or skipped.
7. **Brand does not change.** Harbour Signal tokens, the Prow logo files exactly as supplied, Archivo headings, Inter body. Red stays for action only. Business accent colours do not change.
8. **Copy rules still apply.** No money words, no "platform" or "solution". Motion never makes a claim the product cannot keep.
9. **One kill switch.** `<html data-motion="on|off">`, from the motion switch in Admin → Content (stored in `site_content` under `motion`, default on). Off turns every animation and transition on the site off from the next request, with no deploy. Reduced-motion visitors always get off.
10. **Never:** motion on `/futprep/register`, any form that holds a child's details, booking and payment-request flows, sign-in, `/account`, `/business/*` or `/admin/*`; an animation that loops forever (the hero drift is the one exception; featured logos move one at a time); parallax that moves text faster than the scroll; an effect that needs a click to dismiss.

## How it is built

`lib/motion/motion.css` (loaded after the tokens) holds the reveal rules, the reduced-motion block and the kill switch. Three switches decide whether anything moves:

| Switch | Where | Says |
| --- | --- | --- |
| `prefers-reduced-motion` | the visitor's device | the visitor's own choice; always wins |
| `html[data-motion]` | written by `app/layout.tsx` from the site setting | the kill switch |
| `html[data-motion-js]` | one inline line at the top of `<body>` | JavaScript is running |

A scroll reveal starts hidden only when all three say yes; otherwise the page shows its final state. If the script that marks "in view" never runs (an error on the page), a 2.5 s CSS failsafe shows the final state anyway; the first `<Reveal>` to mount sets `html[data-motion-ready]`, which stands the failsafe down so a reveal reached later still rises.

In JavaScript, `motionEnabled()` from `lib/motion/client.ts` answers the first two questions, so a script and the stylesheet never disagree.

### `<Reveal>`

`app/_components/motion/Reveal.tsx`. A client component that renders one element with `data-reveal="<variant>"` and, through one shared `IntersectionObserver`, adds `data-in` once 15% of it is in view. Once: nothing replays on the way back up.

```tsx
<Reveal variant="rise">…</Reveal>                 // fade | rise (16px) | scale (.96)
<Reveal variant="rise" delay={2}>…</Reveal>       // 0 to 6 steps of 60ms
<Reveal as="ul" variant="rise" stagger>…</Reveal> // the children arrive 60ms apart, six steps at most
<Reveal as="section" className="…" id="…">…</Reveal>
```

`stagger` leaves the element itself still and moves its direct children; the seventh child and beyond arrive with the sixth. Never stagger more than one level at once. The hero is not a `<Reveal>`: it is visible before any script runs (rule 3) and has its own CSS entrance.

### The hero and the header (M2)

`lib/motion/public.css`, loaded by the root layout and scoped to the hero and to pages on the home theme.

- **The hero**: the kicker, the headline's two lines, the lede and the buttons rise in 60ms apart (`--dur-hero`, `--ease-out`), CSS only, on text that is in the HTML at its final size. The photo drifts from scale 1 to 1.04 over `--dur-drift`, alternating, the one looping animation on the site; `HeroMotion` pauses it and drops its layer (`will-change`) while the hero is off screen.
- **The Prow moment** (`ProwMoment.tsx`): once per session on the first load of `/`, a copy of the supplied mark sits over the header logo's mark and its two red stripes slide in behind the hull over `--dur-slow`, then it fades over `--dur-fast`. A layer over one 36px mark, never over content; remembered in `sessionStorage` (inside try/catch) and once per page load whatever storage says, so it never replays on navigation.
- **The header** (`HeaderMotion.tsx`): sticky on the home theme. Past 24px of scroll it gets `data-condensed`: the logo scales from 36 to 30px by a transform (so the row's height never changes) and a 1px `--line` rule fades in under it. Anchors scroll to just under it (`scroll-margin-top`).
- **The category menu**: on the home theme and the directory pages, the desktop panel opens with a `--dur-menu` fade and an 8px rise, and the phone's Browse sheet uses the same tokens; a business's own page keeps its header still.

### Sun Drift (M2 step 4, tested before it shipped)

Once per page view a soft white glow (Harbour Signal's own `--paper`, no new colour) rises behind the hero's words like morning light over `--dur-sun` (1.6s), by transform and opacity, and stays. It is one radial gradient between the photo and the scrim: no clouds, no waves, nothing that loops (the photo's drift stays the one loop on screen). Its resting state is the risen sun, so reduced motion and the kill switch show it already up; without script it still rises, in CSS. It went in only after the motion check measured `/` both ways on the same runner: Lighthouse mobile on the branch's build without the sun, then with it, and the headline's contrast over the photo with and without it (the numbers are in the PR that added it).

### The sections (M3)

Also in `lib/motion/public.css`; the Departure Board in `app/_components/motion/DepartureBoard.tsx` and `BoardFlicker.tsx`.

- **Open now**: the grid is a `<Reveal stagger>`, each card in its own slot, so the slot carries the reveal and the card its own hover (`transition` on a stagger's children would otherwise beat the card's). On a pointer device (`hover: hover`, `pointer: fine`) the card lifts 4px and the arrow nudges 4px; on touch (`hover: none`) a `--dur-press` scale to .98 answers the tap. A card that leads to a child's details ("Register a child", a children's camp) carries `data-still` on the whole card and never lifts, presses or pops its chip.
- **Where do you want to go**: a live section card lifts 4px on hover. The sections not open yet are the "Coming next" line under the grid, which stays still in the muted colour, so the live ones read as live.
- **How it works**: each track is a `<Reveal as="ol" stagger>` of numbered steps with a line (`<svg class="home-how-line">`, a path with `pathLength="100"`) down its left, given its steps' height (an `<svg>` does not stretch between a top and a bottom on its own). Where the browser has scroll-driven animations the line draws with the scroll (`animation-timeline: view()`, inside `@supports`); elsewhere it draws once on reveal (`stroke-dashoffset` transition). Each number counts in with a `--dur-base` fade and scale after its step, and screen readers hear it. The brief names `stroke-dashoffset` for this line: with the Departure Board's character swap, one of the two exceptions to transform and opacity, and it causes no layout.
- **List with PortPass**: the homepage's band is a `<Reveal as="section" stagger>`; it is `--deck` until it enters, when an `--ink` layer (`::before`, opacity) eases in over `--dur-slow`, and the words and then the button arrive after it. Only the revealed band does this (`.home-business[data-reveal]`); the bands of the same class on `/pricing` and `/business` keep their own colour.
- **Held states end shown.** The step numbers, the fallback line and the ink layer start hidden, so each carries the reveals' failsafe (its final state at `--dur-failsafe` if the script never takes charge) and a reduced-motion rule that shows it at once.
- **Squish Buttons**: on the home theme (`/`, `/business`, `/pricing`, `/app`) and the category pages, a button that is not about money, a child's details or signing in gets a physical press: on `:active` it moves down 4px and squashes (`scale(1.04, .92)`) over `--dur-squish` with `--ease-spring`, and springs back; on a pointer device it lifts 2px on hover. It is opt-in by class (`.home-button`, `.feature-card-button`, the menu triggers and Browse) and opt-out by `data-still`: the pricing plans' buttons, "Register a child", the camp cards, every category card that shows a price or a perk, and every sign-in link never move. The press moves the button, not the place it can be pressed: while it is hovered or held, an invisible 12px margin above and below (`::after`) keeps the spot a press began on inside it, so a click begun at its edge still lands. Under reduced motion and the kill switch nothing lifts or squashes, not even at once. The focus ring is an outline and is unchanged.
- **Bounce Badges**: the "Open now" and "Closes in…" chips, the live section chips and the category page's subsection chips and "Open now" labels pop in once per page view with the spring, over `--dur-pop`, `--dur-badge-step` apart, six at most (the seventh and beyond come with the sixth). On the homepage they pop when their section is revealed, from `scale(.2)` and 8px down. A category page's are on its first screen, so they pop on load from a visible start (`scale(.6)`, 8px down, never hidden), the chips first and the labels after. A card that holds still holds its chip or label still too: a category card with a price (today, every live one, Futprep's on `/sports-fitness` among them) keeps its label still. Perk chips stay still (they are about money).
- **Departure Board**: a numbers strip under the hero with the real counts the homepage already reads (businesses open, categories open, the camps that have their own card above), each digit in a fixed-width cell. When most of it (60%) first comes into view the digits flicker like a split-flap board, one `--dur-flap` at a time, for `--dur-board`, and settle. The true numbers are in the server HTML and in the strip's `aria-label`, so it is right without script and for screen readers; a count of 0 is left out rather than shown. The flicker swaps characters inside fixed-width cells, one of the two exceptions to "transform and opacity only", with no layout shift; it does not run under reduced motion or the kill switch. The cells are the board's own `--ink` lit by a tenth of `--paper`, with an ink seam: Harbour Signal and nothing else. The demo business is never counted (the database keeps it unpublished and unlisted).

## Adding an effect

1. Decide what moves: `transform` and `opacity` only. If the effect needs a layout property, it is a different effect.
2. Write it in CSS with the tokens. Scroll reveals use `<Reveal>`; a hover lift is a transition; an entrance is `@keyframes`; a scroll-linked effect goes inside `@supports (animation-timeline: view())` with a plain reveal as the fallback.
3. Say what the final state is under `prefers-reduced-motion` and `html[data-motion="off"]`. The global block turns the animation off; if the resting state is not the final state (a fade-in from 0, say), add a rule that sets the final state there, as `motion.css` does for reveals.
4. Keep the first screen visible without script. Anything above the fold renders in its final state in the HTML and animates from it, never to it from hidden.
5. Pause or skip it off-screen: a `will-change` only while in view, an infinite animation only on the hero drift.
6. Put the CSS in a file the pages import (never the end of `globals.css`), check its class prefix against `app/*.css` first.

## Testing it

`.github/workflows/motion-checks.yml` runs `scripts/motion/check.mjs` on every PR that touches the public site's motion: the app on localhost against the local Supabase stack with TEST data, Chromium at 375px. Besides the usual TEST seed it runs `scripts/motion/seed-motion-fixture.ts` (local stacks only): one TEST business live in Entertainment, first in the homepage order and with a vector logo, so that section is a live category page with something to pop, morph and idle.

- Reduced motion: `document.getAnimations().length` on `/` is 0 after load and after scrolling to the end; every reveal is at full opacity, and the step numbers, the line and the ink band show their final state.
- No JavaScript: the hero headline, image and both buttons are on the first screen; no reveal is held hidden.
- The app's script blocked (its chunks never arrive, after the inline line has run): the page is held as before its script, and within `--dur-failsafe` the step numbers, the ink band and every reveal show.
- A slow phone (CPU slowed 4x): a filmstrip of the first 1.8 s and of the first section revealing (the `motion-checks` artifact, `frames/`), a reveal below the fold is still held 3 s after load and is on its way in once scrolled to, every reveal has arrived after one scroll through the page, and the layout shift measured in the page is under 0.05.

- The sections (M3): the Open now cards carry a 60ms stagger; the How-it-works line is undrawn before its steps come near, runs the length of its steps, and is fully drawn with every number counted in once the steps are in the middle of the screen; the List-with-PortPass band has eased to ink with its button arrived; nothing re-triggers on scrolling back up and down again; and at 1440px a card lifts 4px and its arrow nudges 4px on hover, while a card that leads to a child's details never lifts. A Squish Button lifts 2px on hover and squashes 4px down on press, a press begun at its very top edge still clicks it, and under reduced motion it never moves; a pricing plan's button never moves. Each Open now chip pops once and not again on the way back, and a still card's chip never pops. On a category page no chip or label starts hidden, the subsection chips pop once from a visible start, and a card with a price keeps its "Open now" label still. The Departure Board flickers when it comes into view, settles on its true values (the same numbers, in order, as its `aria-label`) and never changes size; under reduced motion it never flickers.
- The Prow moment, the drift and the header (M2): the moment plays on the first load and not on the second in the same session; the drift runs on screen and is paused off screen; the header is condensed, at the top, and the same height after scrolling; at 1440px the logo condenses by a transform to 30px and the category menu fades in.
- The hero's words against the photo: once everything in the hero that ends has ended, the area behind the headline is photographed with the words hidden and its darkest 5% compared with the headline's colour; the headline must reach WCAG AA for large text (3:1), and the lede's ratio is reported against 4.5:1. A new layer behind the words (the Sun Drift) is measured with and without itself.

The script reads one optional env var, `MOTION_BASE_URL` (default `http://localhost:3000`), and refuses any host but localhost.

The kill switch is covered by unit tests (`lib/siteContent.test.ts`) and by reading `<html data-motion>` on the live site after a save in Admin → Content.

**Lighthouse, twice.** The same job then runs Lighthouse mobile on `/` three times against the branch's own build (375×812 at 2x, simulated slow 4G and a 4x slower CPU, as `lighthouse.yml` does) and `scripts/motion/lighthouse.mjs` keeps the median and writes the table and the largest-paint element into `report.md`, with a BELOW line when the median is under 0.85, a run has no score, or a run's CLS is 0.05 or more. That step reports and never blocks the job: localhost reads a few points under production (no CDN, a local database), so compare a branch with `main`'s run of the same job, not with production's numbers. The 85 floor that blocks is production's. After each merge `.github/workflows/lighthouse.yml` measures production; the `/` score and CLS come from its `lighthouse-indexed` artifact (`lhr-*.json`, `categories.performance.score`, `audits.cumulative-layout-shift.numericValue`). Report the run before the merge and the run after.

For a phone in hand: Android Chrome → Settings → Accessibility → "Remove animations" (or iOS → Accessibility → Motion → Reduce Motion) must leave every page still and complete.
