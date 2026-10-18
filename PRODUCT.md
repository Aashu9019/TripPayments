# SajiloTrip — trip money, settled

## What it is
A small installable web app (PWA) for groups of friends on a trip. One person
(the leader) creates the trip, adds friends, and fills in the logistics: route,
stays, phone numbers. Everyone joins with a 6-letter code and shares the same
ledger.

## The problem
On a trek like Shey Phoksundo, five friends pool cash on day one, then one
person pays the jeep, another pays the teahouse, the common fund pays for
dal bhat. By the end nobody knows who owes whom.

## Core jobs
1. Record a payment in under 10 seconds: amount, who paid (a person or the
   common fund), who it was for.
2. See your number: "you are owed Rs 1,240" or "you owe Rs 860".
3. Settle with the fewest transfers, and mark them paid.
4. Track the common fund: who put in what, what it paid for, what's left.
5. Find the hotel's phone number with no signal anxiety (works offline from
   the last sync).

## Users
Friends on a budget trip, mostly on mid-range Android phones, often on weak
mobile data. Not accountants. Nepali rupees by default.

## Principles
- One number matters most: your balance. Show it first.
- Everything is editable; mistakes on a trek are normal.
- No sign-up. The trip code is the key. Trust between friends is assumed.
- Works offline for reading; writes need a connection.

## Non-goals
Bank integrations, receipts OCR, multi-currency conversion, chat.

## Surface mode
Operate. The app UI is a tool used many times a day.
