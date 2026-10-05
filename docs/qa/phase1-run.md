# The Phase 1 run

The end-to-end check to repeat before each release (brief 19, part B). It follows one made-up business from its owner's sign-up to a paid booking and a marked register, then the customer's account, the demo and the event form.

There are two ways to run it, and a release wants both:

1. **The automated run** (about 4 minutes, no phone needed). GitHub → Actions → **Phase 1 end-to-end run (TEST data)** → Run workflow. It plays every step below that a script can play, at phone width, on a private copy of the site with a throwaway database. The job's summary shows a table of steps with pass or fail and the time each took; the `phase1-run` artifact holds a 375px screenshot of each. The script is `scripts/e2e/phase1-run.mjs`.
2. **The run by hand on the live site** (about 20 minutes, on a phone). The steps marked **By hand** below. These are the parts a script cannot do: a real inbox, Google sign-in, a real phone's install prompt and camera roll.

## Rules

- TEST data only. Name everything "TEST …" so it is easy to find and delete, and delete it at the end (step 6).
- Never message a real person. The only inbox a test may write to is your own.
- Never say or imply card payments work. Customers pay the business directly: cash, bank transfer, or a Kanoo wallet transfer they make themselves.
- A child's health details never appear on `/account`, a booking page or a payment page. If one does, stop: that is a release blocker.

## The steps

"Automated" means the job checks it on every run. "By hand" means it needs a person on the live site.

### 1. A business owner, from sign-up to a live page

| # | Do this | Expect | Checked |
|---|---|---|---|
| 1.1 | `/signup` → "I run a business" → a new email, name, phone, business name, section. Enter the six-digit code from the email. | You land on `/business/setup`. | Automated. **By hand:** that the code email arrives in a real inbox within a minute. |
| 1.2 | Setup: one-line description, WhatsApp number, two offerings with prices, then **Get paid** (cash and bank transfer, with bank name, account name and the last four digits). | Each step saves. The preview shows the page as customers will see it. | Automated |
| 1.3 | Add a hero photo and four more from the phone's camera roll. Tick "Children appear in some of my photos" if any do, then tick consent on each photo. | Each photo appears within a few seconds, the right way up. Photos without a consent tick say "Hidden until consent confirmed". | Automated by the **Photos from a phone** job (a 17 MB JPEG and HEIC files). **By hand:** one photo from a real iPhone and one from a real Android phone. |
| 1.4 | Open the business home. | "What your page is missing" lists what is left, each with a link to where it is fixed. | Automated |
| 1.5 | Review & submit. | Status reads "Under review". | Automated |
| 1.6 | As a PortPass founder: Admin → Businesses → Submitted → Approve. | The page is live and public. Admin → Phase 1 lists it with anything its page is missing. | Automated |

### 2. A customer books, and pays, on a phone (375px)

| # | Do this | Expect | Checked |
|---|---|---|---|
| 2.1 | Find the business from the homepage. | Its card is under "Open now" and opens its page. | Automated |
| 2.2 | Find it from search. | It is in the results. | Automated |
| 2.3 | On its page tap **Request to book** on a priced offering. Fill in the date, time, how many, where, your name, phone and email. Send. | You land on your booking page with a reference like `TRB-B0001` and "[Business] will confirm within a day". | Automated |
| 2.4 | Check the customer's inbox, and the owner's. | "Booking request received" to the customer; "New booking request" to the owner. Nothing arrives by WhatsApp. | Automated up to the Messages log. **By hand:** both emails arrive (Resend). |
| 2.5 | As the owner: the business home shows "Bookings · 1 new". Open Bookings and press **Confirm**. | The request moves to Confirmed. The customer gets "Your booking is confirmed". | Automated. **By hand:** the email arrives. |
| 2.6 | On the confirmed booking press **Request payment**. | The new request is filled in with the customer, the offering and its price times the quantity asked for. Create it, then **Send by email**. | Automated. **By hand:** the payment request email arrives. |
| 2.7 | As the customer: open the booking page, tap **See how to pay**, then **I've paid** and add a note. | The pay page shows the amount, the reference and how to pay the business directly. After the tap it says the business has been told. | Automated |
| 2.8 | As the owner: Payments shows a customer says they've paid. Mark it paid (cash). **Email the receipt.** | The pay page says "Paid in full" with a receipt link. | Automated. **By hand:** the receipt email arrives. |

A test address (`…@test.portpass.local`) is never emailed: the automated run checks that "Send by email" to one is refused, logged as skipped, and leaves the request unsent. That is the safety rail working, and it is why the arrival of each email is a by-hand step.

### 3. A child is registered and marked present

| # | Do this | Expect | Checked |
|---|---|---|---|
| 3.1 | As the owner: Registrations → add a class for children with a term that has started. | The class is listed as Open. | Automated |
| 3.2 | As a parent: the business's page → Register → fill in the form for a child. | A reference like `PP-2026-XXXXXXXX`, and "Registration received" by email. | Automated up to the Messages log. **By hand:** the email arrives. |
| 3.3 | As the owner: Registrations shows the child. Attendance → the last session → mark Present. | The mark is saved. | Automated |
| 3.4 | Open the Growth report. | It loads and counts the registration and the attendance. | Automated (that it loads and the mark is stored). **By hand:** read the numbers. |

### 4. The customer's account

| # | Do this | Expect | Checked |
|---|---|---|---|
| 4.1 | Sign up as a customer with the same email, by email code. | `/account` lists the registration and the booking request, with a link to the booking page. No health details anywhere. | Automated |
| 4.2 | Sign out. Sign in with Google using an address that has a booking. | The same list. | **By hand** |
| 4.3 | On an iPhone in Safari: Share → Add to Home Screen. On Android in Chrome: the install prompt. | PortPass installs with its own icon and opens without the browser's bars. | **By hand** |
| 4.4 | Turn on aeroplane mode and open the installed app. | The homepage opens from the phone. A page never opened before shows "You're offline." | Automated: the homepage and the offline page are saved on the device. **By hand:** open it with no signal. |

### 5. The demo and the event form, on a phone

| # | Do this | Expect | Checked |
|---|---|---|---|
| 5.1 | `/demo` → Start. Open every tile and every screen behind it. Press the buttons. | Every screen opens. Nothing is sent and nothing typed is kept: the demo says so. | Automated: every demo screen is opened (47 on 5 Oct). **By hand:** press the buttons on the live demo. |
| 5.2 | Press **Leave the demo**. | You are back outside it, and `/demo/home` no longer opens. | Automated |
| 5.3 | `/own` with aeroplane mode on: fill in the form and send. | "It will send when you're back online." | Automated |
| 5.4 | Turn the signal back on. | The sign-up arrives in Admin → Leads without being typed again. | Automated |

### 6. Delete every TEST row

The automated run deletes its own rows and reports what it removed. After a run by hand on the live site, delete in this order (Admin where there is a button, otherwise ask for them to be removed from the database):

1. The TEST business's attendance marks, registrations, sessions, terms and classes.
2. Its booking requests and payment requests (and the payments recorded against them).
3. The TEST business itself, with its offerings, photos and payment settings.
4. The TEST lead from `/own` (Admin → Leads).
5. The TEST owner and TEST customer accounts (Admin → People).

Then check Admin → Bookings and Admin → Payments show nothing named TEST.

## Results: 5 October 2026

### The automated run

Run on the code that is live (after parts A, C, D, E and F of brief 19 were merged), on a local copy with a throwaway database, at 375px. Every step passed.

| Part | Step | Result | Time |
|---|---|---|---|
| 1 | A business owner signs up with a new email | pass: sent on to /business/setup | 6.2 s |
| 1 | Setup: the business, its contact details, prices and Get paid | pass: a TEST business | 1.2 s |
| 1 | The owner sees what the page is missing, then submits it | pass | 0.9 s |
| 1 | A PortPass founder approves it and the page goes live | pass: status live, in the directory: true | 2.1 s |
| 2 | A stranger finds the business from the homepage | pass | 1.2 s |
| 2 | …and from search | pass | 0.3 s |
| 2 | Request to book, on the business's page | pass: TRB-B0001 | 0.9 s |
| 2 | The confirmation email is sent to the customer, and the owner is told | pass: Messages log: customer skipped, owner skipped (a test address is never emailed) | 0.0 s |
| 2 | The owner sees the request on their dashboard and confirms it | pass | 1.4 s |
| 2 | Request payment, prefilled from the offering's price | pass: TRB-0001: $450.00 | 1.0 s |
| 2 | The customer opens their booking, then /pay, and taps "I've paid" | pass | 0.6 s |
| 2 | The owner marks it paid; the customer sees Paid and the receipt | pass: receipt TRB-R0001 | 0.9 s |
| 3 | The owner adds a class, and a parent registers a child for it | pass: reference issued | 0.4 s |
| 3 | The team's Registrations screen shows the child; attendance is marked; the growth report shows it | pass: session 2026-10-03 | 1.2 s |
| 4 | The customer signs up with an email code; /account shows the booking and the registration | pass | 5.9 s |
| 4 | The offline copy is saved on the device: the homepage and the offline page | pass | 0.8 s |
| 5 | /demo on a phone: every screen opens, then "Leave the demo" | pass: 47 demo screens opened, 28 buttons on them | 2.3 s |
| 5 | /own on a phone: sign up with no signal, then it sends when the signal is back | pass | 2.2 s |
| 6 | Every TEST row is deleted | pass: 1 attendance, 1 registrations, 8 sessions, 1 program_terms, 1 programs, 1 booking_requests, 1 payment_requests, 1 locations, 14 audit_log, 9 message_log, 1 organizations | 0.2 s |

Each step's screenshot is in the job's `phase1-run` artifact, numbered in this order.

### On the live site

| Check | Result |
|---|---|
| The public pages answer (homepage, a section, both live businesses, search, sign-up, sign-in, pricing, perks, guides, the registration form, `/own`, `/demo`, the offline page) | 16 of 16 answer in under a second |
| Pages that need a sign-in send a visitor to sign in (`/account`, `/admin/phase1`, a business's Bookings) | Yes |
| The live businesses can be found from the homepage and from search | Yes: Futprep Athletics and Bahamas Weddings By The Sea on the homepage; Futprep in search for "football" |
| The demo: every screen, with one visitor's session | 47 screens open; Leave the demo ends the session |
| An invalid booking link | Says "This link isn't valid", shows nothing |
| Lighthouse on the nine pages of part C | See the brief 19 report |

### Not done, and why

- **The run was not made on the live site with a TEST business.** Steps 1 to 4 need someone signed in as the owner, as a founder and as a customer. That means creating accounts and typing sign-in codes on the live site, which the assistant that wrote this does not do. The same steps were run on a local copy of the same code instead. The by-hand list below is what closes the gap.
- **No real email was seen arriving.** The automated run uses test addresses, which are never emailed by design.
- **No real phone was used.** Install prompts, opening the installed app with no signal, Google sign-in and a photo from a real camera roll are by-hand steps.

### Still to do by hand on the live site (about 20 minutes)

- [ ] 1.1: a sign-up code arrives in a real inbox.
- [ ] 1.3: one photo from an iPhone and one from an Android phone upload and appear the right way up.
- [ ] 2.4 to 2.8: the five emails arrive (request received, new request to the owner, confirmed, payment request, receipt).
- [ ] 3.2: "Registration received" arrives.
- [ ] 4.2: Google sign-in shows the same bookings.
- [ ] 4.3 and 4.4: install on iOS Safari and Android Chrome, then open with no signal.
- [ ] 5.1: press the buttons in the live demo.
- [ ] 6: delete the TEST rows.

### Bugs found while making this run, and what was done

| Found | Where | What was done |
|---|---|---|
| The photo cards on the Look step could not be read on the dark theme: white text on white ("Make main", "Remove", the consent line). | The photos job's screenshot | Fixed (#145) |
| A photo under 1.2 MB was stored exactly as the phone saved it, including where it was taken. | Reading the upload path for part E | Fixed: every upload is re-made on the server (#145) |
| HEIC photos were refused unless the phone converted them first; a large photo the browser couldn't shrink failed at the host's size limit with no useful message. | Part E | Fixed (#145) |
| A business page's hero photo was the full-size original, loaded late. | Lighthouse | Fixed (#146) |
| Three places on Futprep's registration form were too faint to read comfortably. | Lighthouse | Fixed (#146) |
| A coach's photo pointed at a file that was never there, giving a browser error on the homepage and the registration form. | Lighthouse | Fixed (#146) |
| The homepage's retry after a database hiccup never reached the database, so it sometimes cached without its "Open now" cards. | Vercel and Supabase logs | Fixed (#141) |

The run itself found no fault in steps 1 to 6. Its first attempt failed in four places, each a mistake in the script's expectation and not in the site: a test address is rightly refused email (twice), a signed-in page is rightly never kept for offline use, and a scripted browser cannot take the signal away from the offline part of the app.

One thing the run could not see even locally: the sign-up code was read from the local sign-in service, not from an inbox, because the job's mail catcher did not answer.
