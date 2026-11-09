# Lead nurture: welcome email and sequence

For people who left their email on a Guides or Tools page (`event: "lead"` from the `lead-capture` function). Works in n8n or Kumoda; the copy does not depend on the tool.

Leak Test takers are a different flow: they already get their result email and the `submitted` / `paid` events. Do not also put them in this sequence. In the workflow, skip `source = leak-test`.

## Rules for the workflow

- **Send to:** `event = lead` only, one email address once. The function never sends a repeat.
- **Always include** the `unsubscribe_url` from the payload in the footer of every email.
- **Stop the sequence when** the person unsubscribes, takes the Leak Test, or buys or enrols. The first two need the lead's address checked against `breadmaker.leads.unsubscribed_at` and `leak_test_submissions.email` before each send.
- **Timing:** one email a week: day 0, 7, 14, 21, 28. The promise on the signup form is "Get one email a week", so do not send more often than that. Send mid-morning in the recipient's time zone if the tool can do it (Lagos by default).
- **No earnings claims** and no countdowns. Keep it to what the system does.
- **Sender:** a person, not a brand: "Ademola at Breadmaker". Reply-to goes to a mailbox someone reads.
- **Variables:** the greeting uses `{{contact.first_name}}`. The signup form requires a name, and Leak Test contacts have theirs, so it is never blank. Everything else is written out in full, so the emails work for every contact. The footer link is `{{context.unsubscribe_url}}`, a per-contact link that Kumoda automation emails now support.

---

## Email 0 · Welcome (send straight away)

**Subject:** Your first move, and where to start
**Preview:** One small action you can do this week.

Hi {{contact.first_name}},

Thanks for signing up. I'm Ademola, the Technical Founder of Restart Inc., and Breadmaker is where I write down what works in the systems we run for paying clients.

Here is what to expect: one short email a week, each with one action and a clear sign that it is done. No long courses, no promises about sales.

If you want to know where to begin, the free Business Leak Test takes about four minutes. You get a score and the one area costing you the most.

https://breadmakersystems.com/leak-test

Reply to this email if you'd like to tell me what you're working on. I read every reply.

Ademola
Breadmaker Systems, a program of Restart Inc.

{{context.unsubscribe_url}}

---

## Email 1 · Day 7 · Leaks, not gaps

**Subject:** You probably don't need more leads
**Preview:** Most businesses already bring in enough. They lose it on the way through.

Hi {{contact.first_name}},

Most owners think they need more: more leads, more tools, more hours. Often the business already brings in enough and loses it on the way through. A leak is a place where something valuable escapes without you noticing.

There are six places it usually happens: your offer, your sales follow-up, your operations, your cash, your team and your tech.

One short guide walks through all six, with an example of each:
https://breadmakersystems.com/guides/where-your-business-leaks

**One action:** open it and circle the pillar that made you wince.
**Done when:** you can name it in one word.

Ademola

{{context.unsubscribe_url}}

---

## Email 2 · Day 14 · Pick your first fix

**Subject:** One small fix, about an hour
**Preview:** Pick the one that sounds like you.

Hi {{contact.first_name}},

Here are six small first fixes, one for each place a business leaks. Pick the one that sounds most like you and do only that one this week.

**Your offer is vague.** Write your offer in one sentence: who it is for, what they get and the price. Put it at the top of your page and your messages.

**Enquiries go cold.** For two weeks, answer every enquiry within a day and keep a simple list of each one and what happened. You cannot fix a leak you cannot see.

**Everything lives in your head.** Write down the five steps you do for every customer, in order. That list is your first system, and everything else gets built on it.

**Money is mixed up.** Keep business money in its own account. Every Friday, write down money in, money out and what you are still owed.

**Only you can do things.** List the three tasks only you do. Write instructions for one of them and hand it off this month.

**Your tools are not really yours.** Move your domain and key accounts under your own login, turn on two-step sign-in, then test your payment or enquiry form from start to finish.

Can't pick one? The free Leak Test names your biggest leak in about four minutes: https://breadmakersystems.com/leak-test

**Done when:** your chosen fix is written down somewhere you will see it tomorrow.

Ademola

{{context.unsubscribe_url}}

*Optional, later:* once a form sets `biggest_leak` for newsletter signups too, you can split this into six emails behind a Condition on that field. Today only Leak Test contacts have it, and those people are not in this sequence.

---

## Email 3 · Day 21 · How we prove a system

**Subject:** What "proven" means here
**Preview:** It runs as specified. It does not mean it earns.

Hi {{contact.first_name}},

Fair question: why should you trust a system we teach?

The systems come from work Restart Inc. does for paying clients, and those deployments are live today. Breadmaker turns the parts that last into builds you can follow and own. We run a system first, say what it should do, keep a written record and name the risks.

"Proven" means it runs as specified. It does not mean it earns, and we never promise sales. The teaching is newer than the systems, and we are still tuning it with learners. We say so.

How we do it, in more detail:
https://breadmakersystems.com/guides/how-we-prove-a-system

**One action:** if there is a system you wish you had, reply and tell me which. It decides what we write up next.

Ademola

{{context.unsubscribe_url}}

---

## Email 4 · Day 28 · Two ways to build

**Subject:** If you want to build it, not just read about it
**Preview:** Launchpad or Foundry, depending on how technical you are.

Hi {{contact.first_name}},

If you are ready to build, there are two guided paths:

- **Launchpad:** a working page live in days, for owners who are not technical. https://breadmakersystems.com/launchpad
- **Foundry:** a 30-day build of a system you own, for owners comfortable with tools and code. https://breadmakersystems.com/foundry

Not sure which? Tell me what you do and how comfortable you are with a terminal. I'll point you to one, and I'll tell you honestly if neither fits.

Either way, the Leak Test is still the fastest way to see where to start: https://breadmakersystems.com/leak-test

Ademola

{{context.unsubscribe_url}}

---

## After email 4

Stop. Do not keep emailing someone who has not engaged. If they open or click, move them to the monthly note, once you have one. If they have not opened any of the five, mark them cold and leave them alone.

## Running it in Kumoda (the chosen route)

1. **Lead form:** Leads → Lead forms → New form. Name "Newsletter", tag `newsletter`, pipeline "Contact only", source label `site`, WhatsApp/SMS consent "Per submission". **Leave "Opt new contacts in to email marketing" unticked.** The site sends `consent_email: true` and the exact tick-box wording on every signup, which opts each person in and logs the wording.
2. Copy the form's URL into `KUMODA_NEWSLETTER_WEBHOOK_URL` in the edge-functions container, then restart it. Re-run `outputs/install-lead-capture.sh` first so the function has the Kumoda push.
3. **Fields Kumoda receives:** `email`, `name`, `source`, `biggest_leak`, `unsubscribe_url` (saved as custom fields), plus `consent_email` and `consent_text`. The email footer uses Kumoda's own `{{context.unsubscribe_url}}`, not the custom field.
4. **Automation:** trigger "Tag Added to Contact" with the tag `newsletter`, then the five emails with a 7-day wait between each (day 0, 7, 14, 21, 28). Exit the automation if the contact is tagged `leak-test-paid` or a buyer.
   - **Email type: Marketing** on every Send email step. It sends only to contacts opted in to email, skips everyone else, and adds the unsubscribe footer and one-click headers. (Autoresponder mode always sends and adds no footer, so it is wrong for a newsletter.)
   - **Body format:** plain text keeps line breaks and turns links into clickable links, which is all these emails need. Use HTML only if you want formatting.
   - **From name:** "Ademola at Breadmaker". The step's From name field works now.
   - **Unsubscribe line:** if you add `{{context.unsubscribe_url}}` yourself, Kumoda does not add its own footer. Otherwise leave it out and let the automatic footer do it.
5. **Unsubscribe:** use Kumoda's `{{context.unsubscribe_url}}` once automation emails support it (see the section below). Do not email anyone who has unsubscribed there.

n8n still receives `event: "lead"` if `N8N_LEAK_WEBHOOK_URL` is set. Do not build a second sequence there, or people get two.

## Unsubscribe: keep one source of truth

Kumoda's unsubscribe, from the link or the mail app's button, turns that contact's email opt-in off in Kumoda, and Marketing-mode steps then skip them. It does not update `breadmaker.leads.unsubscribed_at`, so the two can disagree.

- **Kumoda is the list that sends.** Someone who unsubscribes there stops getting the sequence.
- **`breadmaker.leads` may still show them as subscribed.** A later signup on the site does not re-add them (the function skips people already marked as newsletter members), so nobody is re-subscribed by accident. Anyone who wants back in has to ask by email.
- **Requests by email** to privacy@restart.ng should be handled by hand in both places.
- **The clean fix:** ask Kumoda to call a webhook when a contact unsubscribes, so a small function can set `unsubscribed_at`. This was not part of the four changes.
- The site's own `/unsubscribe` page still works for anyone who holds one of its links.
