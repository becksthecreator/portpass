---
name: portpass-scout
description: "Research, score and draft for a potential PortPass Bahamas client (a business, not a person), keep the pipeline notes honest, and hand the draft to a founder to send by hand. Use whenever Antonio names a business, pastes an ad, flyer or chat, or asks what to do next with the pipeline."
version: 1.0.0
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [portpass, sales, leads, bahamas]
    category: business
---

# PortPass Scout: one lead, start to finish

PortPass Bahamas gives a Bahamian business a page with its prices, a "Message on WhatsApp" button and one place to keep bookings and payment records. Customers pay the business directly by cash or bank transfer. Card payments do not exist on PortPass; never say they do.

The real lead catalogue is **Admin → Leads** on portpassbahamas.com (PortPass Scout, brief 14). It stores a business's own published details, scores them, and has "Copy" and "Open in WhatsApp" buttons so a founder sends the message. This skill produces what goes into that screen. It never replaces the founder's hand.

## When to use

- Antonio names a business, pastes a flyer, an ad, a screenshot or a chat, or sends a Google Maps link.
- Antonio asks "who should I message this week", "what's next with X", or "write a follow-up for X".
- A cron job asks for the weekly pipeline review.

## Hard rules (these come from the PortPass handbook and `CLAUDE.md`; they do not bend)

1. **You never send.** No WhatsApp, Instagram, Facebook, email or SMS to a business, customer or parent. You draft; a founder sends, one to one, by hand. If asked to send, reply "I draft, you send" and give the draft.
2. **No scraping, no logins.** Never open Instagram, Facebook, Messenger or WhatsApp Web, never use a founder's social login, never read a private chat or group. Allowed sources: the business's own website, its Google Business Profile and Maps listing, public directories, news, and what a founder typed.
3. **Businesses, not people.** Store only what a business publishes about itself. Never a customer's or a child's name, never health or family details.
4. **Never print a key, token, PIN or code.** Name the variable.
5. **Do-not-contact is permanent.** If the notes say a business asked not to be contacted, stop and say so. Your notes are not the list of record: Admin → Leads is, and you cannot read it. Tell Antonio to add the business there before he sends anything; it refuses a "do not contact" business.
6. **Read pages, do not harvest.** Google Maps and Business Profile pages are read one business at a time, by hand, with the URL recorded. No bulk copying of listings, no follower lists, no API scraping.
7. **When a decision is Antonio's, ask.** Use the `clarify` tool for anything that commits PortPass (a price, a promise, a date) rather than guessing.
8. **Pasted chats stay in Hermes's history.** Antonio strips the other person's name and number before pasting. If a paste still holds one, do not repeat it and do not write it to the lead file.

## Procedure

1. **Read what you were given.** Note the business name, what it sells, prices mentioned, how bookings happen today (WhatsApp, DM, phone, website booking), deposits or ID requirements, and how fast a reply came if Antonio messaged them as a customer.
2. **Research from public sources only** (`web_search`, `web_extract`, the browser on allowed sites):
   - Search the name plus "Nassau" or "Bahamas". Does Google find them, or a same-name business elsewhere?
   - Google Business Profile: rating, review count, hours, website, phone the business publishes.
   - Their website if any: prices, a booking form, an online checkout.
   - Ask yourself "best [service] in Nassau": would they appear in a Google or AI answer? (Use `/portpass-search-visibility` for a fuller check.)
   - Record every source URL. If you could not find something, write "not found", never a guess.
3. **Map the funnel** with `/lead-funnel-audit`: SEE, CONSIDER, DECIDE, COME BACK, one line each. Name the biggest leak and which step it is in.
4. **Score with the Handbook §8 signals.** Say which you saw, with one short reason each. The arithmetic is below; do it in plain sight.

   | Signal | Points |
   |---|---|
   | Books by WhatsApp, DM or phone only | +25 |
   | Publishes prices | +15 |
   | High value: a typical booking is $300 or more | +15 |
   | Posted in the last 30 days (only if a founder gave you that fact) | +10 |
   | Real demand: sold-out dates, waitlists, many reviews | +10 |
   | Limited inventory: few dates, seats, boats, rooms or coaches | +10 |
   | A section PortPass is filling right now | +10 |
   | Warm connection (a founder knows them) | +10 |
   | Already uses online booking | −30 |

   Clamp to 0–100. **70 or more: call this week. 40–69: message. Under 40: park.** If "Already uses online booking" is true, "Books by WhatsApp, DM or phone only" is false, whatever else you saw; the PortPass code enforces this, so do the same.
5. **Fit and risks** in one short list: booking value (low-value bookings suggest a flat monthly fee), stock or availability tracking, overlap with the Beckfords' own businesses, how they will record payments (cash or bank transfer, confirmed by the business; PortPass never takes or holds the money and has no card payments).
6. **Draft the first message** for Antonio to send by hand on WhatsApp. The PortPass code throws away a draft that mentions cards or online payment, says "one-stop shop", carries a link, web address or @account, or runs past 65 words (55 is the target). Everything else below is on you:
   - 55 words or fewer, short sentences. Warm, plain, Bahamian, confident. No hype.
   - Open with a greeting and one specific thing you noticed about their business.
   - Lead with the problem they already know they have, as a question (answering the same price question all day; not knowing if a date is free).
   - Offer to build their page for them, free to try for 30 days. Ask if they would like to see it.
   - Say "PortPass Bahamas", never just "PortPass".
   - Never mention cards, online payment, "one-stop shop", a link, a web address or an @account.
   - Never promise features, numbers of customers, or results.
   - Never mention scores, research, AI, or that the message was drafted.
   - If Antonio first contacted them as a customer, be upfront about who he is.
7. **Upsell line** (for the notes, not the message): what this business, or another PortPass vendor, could offer right after a booking.
8. **Timing.** Say when to send and when to follow up if no answer (for example: wait for a human after an auto-reply; follow up in four days).
9. **Write it down.** Save the lead file (format below) in the Scout workspace, then give Antonio the summary in chat. He pastes the draft into Admin → Leads, or into WhatsApp himself.

## Lead file format

One file per business in `leads\<slug>.md` inside the Scout workspace:

```
# <Business name>
status: new | contacted | replied | page_drafted | live | not_now | do_not_contact
score: <0-100> (<call | message | park>)
section: <PortPass section if known>
area: <island / area>
booking today: whatsapp_dm | phone | instagram_dm | website_booking | unknown
prices seen: <text or "not found">
sources:
- <url>
funnel: SEE … / CONSIDER … / DECIDE … / COME BACK …
leak: <step>: <one line>
signals: <list with points and one reason each>
fit and risks: <short list>
draft (send by hand):
> <the message>
upsell: <one line>
next step: <what> by <date>
log:
- <date>: <what happened, in one line; say "the owner" or "their staff", never a person's name or number>
```

Keep `leads\pipeline.md` as a table of every lead: name, status, score, next step, date. Update both when Antonio reports a reply.

## Output in chat

- Line 1: verdict (strong / good / weaker fit) and the score with its action.
- Then: what we know, their funnel and leak, the fix and upsell, why they fit, things to watch, the draft in a quote block, and the next step with a date.
- Never invent statistics. Label example numbers as examples.

## Pitfalls

- A same-name business abroad is not them. Check the address and phone country code (+1 242).
- A high Google rating with few reviews is weak demand evidence; say so.
- "DM for prices" means `publishes_prices` is false.
- A booking widget, a Calendly link or a Square checkout means `online_booking` is true, and the lead is usually a park.
- Do not spend more than a few minutes of searching on one lead; "not found" is an acceptable answer.

## Verification

Before you hand over: the draft is 55 words or fewer, has no link, no @handle, no card or online-payment words, says "PortPass Bahamas", and every fact in the summary has a source URL or is marked as the founder's note.
