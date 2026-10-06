# Incident response

Owner: Antonio (lead), Adon (communications). Reviewed twice a year with a tabletop run-through. First review due 6 April 2027.

An incident is anything that may have exposed, changed or lost a person's or a business's data, or taken the site down: a leaked key, a sign-in that was not the owner's, a bad release, a provider outage, a bug that showed one family another's details.

## The first hour

| Minute | Who | Do |
|---|---|---|
| 0 | Whoever sees it | Write down the time (Nassau) and what you saw. Screenshot it. Do not fix anything yet. |
| 0–5 | Antonio | Decide: is data at risk right now? If yes, **contain** first (below). If no, go to assess. |
| 5–15 | Antonio | **Contain.** The levers, in order of how much they stop: (1) Vercel → Firewall → **Attack Challenge Mode: on** (every visitor answers a browser challenge; the site stays up). (2) Vercel → Deployments → **Rollback** to the last good deployment. (3) Supabase → Project → API keys → **rotate the secret key**, paste the new one into Vercel, redeploy (every server session dies; staff and admin windows end). (4) Admin → People → **sign out everywhere** for an account that may be taken. (5) Supabase → Project Settings → **Pause project** (the site is down; only when data is leaving and nothing else stops it). |
| 15–30 | Antonio | **Assess.** Admin → Security (failed sign-ins, new devices, recent admin actions with addresses), Admin → Health (errors), Admin → Audit log, Vercel logs (search `csp:`, `security alert`, the route), Supabase logs. Write down what was reached, by whom, from when to when. |
| 30–45 | Adon | **Who is affected.** Which businesses, how many families, which fields. Children's health details: were they among them? (They are only reachable by a business's own staff screens and the audited admin reveal; check the audit log for `registration.health_revealed`.) |
| 45–60 | Antonio and Adon | **Decide and record.** Open a note in the Beckford HQ project: timeline, what was done, what is still unknown, who is told and when. Agree the next check-in time. |

Nothing is said publicly in the first hour. Nobody is messaged by a script: one person, one message, by hand (CLAUDE.md, rule 5).

## Contacts

| Who | For | How |
|---|---|---|
| Antonio Beckford | Technical lead; Vercel, Supabase, Resend, GitHub owner | Phone (in the Handbook), WhatsApp |
| Adon Beckford | Communications with businesses and families | Phone (in the Handbook), WhatsApp |
| Vercel support | The host | vercel.com/help, from the account that owns the project |
| Supabase support | The database, auth, storage | supabase.com/dashboard/support/new |
| Resend support | Email sending | resend.com/help |
| Data Protection Commissioner, The Bahamas | A breach that affects people | dataprotection.gov.bs; notify when personal data was exposed, with the facts from the assessment |
| Central Bank of The Bahamas (once licensed) | A breach that touches payment data | Per the licence conditions |

Phone numbers live in the Handbook, not here: this file is in a public repository.

## Telling the affected businesses

Within 72 hours of knowing, by email from a founder (not a template run by a script), one business at a time. The business tells its families; PortPass offers to help with the wording.

**Template A: data may have been seen**

> Subject: Something you should know about your PortPass data
>
> Hi [owner's first name],
>
> On [date] we found that [plain description: for example, "a sign-in that was not ours reached the admin area for about 20 minutes"]. During that time, [what could have been seen: for example, "the names, email addresses and phone numbers of the families registered with you"] may have been seen. [If true:] No health, allergy or medication details were among them: those are never shown outside your own staff screens. [If true:] No payment details were involved; PortPass never holds card numbers.
>
> We have [what was done: for example, "ended every session, changed our keys and turned on a browser challenge for every visitor"]. We are telling the Data Protection Commissioner too.
>
> What we suggest you do: [for example, "nothing is needed from you; if a family asks, you can share this note"]. If you would like us to write to your families with you, say so and we will.
>
> I am sorry this happened. Call me on [number] with any question at all.
>
> [Founder's name], PortPass

**Template B: data was lost or set back**

> Subject: Your PortPass records between [time] and [time]
>
> Hi [owner's first name],
>
> On [date] we restored our database to [time] after [plain reason]. Anything entered on PortPass between [time] and [time] on that day may be missing: [for example, "a registration or a payment marked received in that window"]. Everything before it is intact.
>
> Please check [where: for example, "Bookings and Payments in your business area"] for that window and tell us anything that is missing; we will put it back by hand with you.
>
> I am sorry for the trouble. [Founder's name], PortPass

## After

Within a week: a written account in the Beckford HQ project (what happened, what was reached, what was done, what changes), the change made (a PR, a setting, a rule in this folder), and the Attack Challenge Mode switched off again if it was on. The account is kept for the compliance file.
