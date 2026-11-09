-- Real lesson content for the six kits.
--
-- Migration 22 seeded each kit step as a one-line stub: the body and the action were the same sentence
-- from the pillar plan and "done when" was empty. This writes the body, the one action and the done-when
-- check for steps 1 to 4 of every kit, from the step descriptions and risks in docs/kit-records.
--
-- It only touches a step that is still the seeded stub (body equals action and done-when is empty), so
-- anything the team has edited in the Studio is left alone, and it is safe to re-run. The "definition of
-- done" session at the end of each kit already has its own content and is not touched.

update breadmaker.lms_lesson_content lc
set body = v.body, action = v.action, done_when = v.done_when, updated_at = now()
from breadmaker.lms_lessons l
join breadmaker.lms_courses c on c.id = l.course_id
join (values
  -- ---------------------------------------------------------------- Offer and pricing sheet
  ('offer-and-pricing-sheet', 1, $t$Your offer is one sentence that says who it is for, what result they get and the price. If you cannot say it in one breath, customers cannot repeat it to a friend.

Do this:
- Write the sentence in this shape: "I help [who] get [result] for [price]."
- Say it to three past customers and ask: "Is that what you bought from me?"
- Write down their words. Where they use different words from yours, use theirs.
- Rewrite the sentence until all three would say yes.

Watch out: do not add a second offer to the sentence. One sentence, one offer.$t$,
   $t$Write your offer in one sentence, then say it to three past customers and note what they say back.$t$,
   $t$You can say your offer in one sentence with who it is for, the result and the price, and three past customers have heard it.$t$),
  ('offer-and-pricing-sheet', 2, $t$A price set from your costs and from the value to the customer holds up better than one copied from a competitor or set by mood.

Do this:
- For each thing you sell, list what it costs you to deliver: materials, time, tools, delivery and fees.
- Put a value on the result for the customer: what it saves or earns them, or what the alternative costs.
- Set the price above your cost, with room for profit, and below the value to the customer.
- Put every price on one page, one line per offer.

Watch out: a price that works on paper can still be wrong for your market. Test a change on a few customers before you apply it to everyone.$t$,
   $t$Work out the cost to deliver each offer, set or fix its price from that, and put all prices on a one-page menu.$t$,
   $t$Every offer has a price based on its cost and the value to the customer, and all prices are on one page.$t$),
  ('offer-and-pricing-sheet', 3, $t$Some customers cost you more than they pay. They are late, they keep changing the job, or the work does not fit what you do best. Written rules let you say no without a fight.

Do this:
- List the customers who were hard, paid late or left you out of pocket. Note what they had in common.
- Turn that into three rules. For example: a minimum order, a deposit before work starts, or a type of job you do not take.
- Use the rules on your next enquiry and write down what you did.

Watch out: apply the rules the same way to everyone. Base them only on fit, behaviour and profit, never on who the person is.$t$,
   $t$Write three rules for customers you will not take on and apply them to your next enquiry.$t$,
   $t$You have three written rules and have used them on at least one real enquiry.$t$),
  ('offer-and-pricing-sheet', 4, $t$Most of your profit usually comes from one offer. If it is buried between others, customers pick whatever is easiest to read, not whatever is best for you.

Do this:
- Look at your last 20 sales and work out which offer brought the most profit, not the most sales.
- Put that offer first on your page, your menu and your first reply to an enquiry.
- Stop promoting the others for now. Keep selling them if someone asks.
- Check again after two weeks: what did people ask for?

Watch out: if you do not have sales to learn from yet, sell first and come back to this step.$t$,
   $t$Pick the offer that brings most of your profit and put it first on your page and in your messages.$t$,
   $t$Your top offer is the first thing on your page and in your first message to new enquiries.$t$),

  -- ---------------------------------------------------------------- Lead capture and follow-up
  ('lead-capture-and-follow-up', 1, $t$Before you fix follow-up, find out where your customers actually come from. The channel that brings the most money is the one to protect.

Do this:
- List your last 10 customers.
- Next to each, write how they found you: referral, WhatsApp, Instagram, walk-in, search or other.
- Add what each one paid.
- Circle the channel that brought the most money, not the most people.

Watch out: if you cannot remember, ask the customer. Do not guess.$t$,
   $t$List where your last 10 customers came from, with what each paid, and circle the channel that brought the most money.$t$,
   $t$You can name the channel that brought most of the money from your last 10 customers.$t$),
  ('lead-capture-and-follow-up', 2, $t$An enquiry you do not write down is an enquiry you can lose. One sheet gives you one place to look.

Do this:
- Make a sheet with five columns: date, name, how to reach them, source and status.
- Use three statuses: new, following up, and won or lost.
- Add every enquiry from today on, including the ones that go nowhere.
- Add the ones you can still remember from the last month.

Watch out: the sheet holds names and contact details. Keep it in one private place with a backup, and do not share it in chats.$t$,
   $t$Start one enquiry sheet and log every enquiry from today on.$t$,
   $t$Every enquiry you have had this week is in one list with its date, source and status.$t$),
  ('lead-capture-and-follow-up', 3, $t$Most sales go to the business that replies first and keeps asking politely. A rule and a few saved messages do that without extra effort.

Do this:
- Set a rule: every new enquiry gets a reply within one working day.
- Write three follow-up messages once: a gentle check after 2 days, a helpful one after a week, and a last one after two weeks.
- Save them where you can paste them quickly, such as WhatsApp templates or email drafts.
- Put each follow-up date in the sheet so you can see who is due.

Watch out: only message people who contacted you or agreed to hear from you. Do not message cold lists.$t$,
   $t$Write your three follow-up messages, save them where you can reuse them, and reply to every new enquiry within one working day.$t$,
   $t$Every new enquiry gets a reply within one working day, and the three follow-ups are written and saved.$t$),
  ('lead-capture-and-follow-up', 4, $t$Your best customers know people like them. A direct ask, and a simple count, show you what is working.

Do this:
- Pick your five best customers.
- Ask each one for a single introduction. Make it easy: tell them who you can help and what to say.
- At the end of the 30 days, count the enquiries and the sales in your sheet, then divide sales by enquiries.
- Write the number down and check it again next month.

Watch out: this count shows how well you turn enquiries into sales. It does not tell you what you will earn.$t$,
   $t$Ask your five best customers for one referral each, then work out what share of enquiries became sales.$t$,
   $t$You have asked five customers for a referral and you know the share of your enquiries that became sales.$t$),

  -- ---------------------------------------------------------------- Delivery checklist and tracker
  ('delivery-checklist-and-tracker', 1, $t$If the way you deliver lives only in your head, nobody else can do it and you cannot see where it goes wrong.

Do this:
- Choose your main job, the one you do most often.
- Do it once and write each step as you go, in order.
- Write each step so someone new could follow it: start with a verb and say what finished looks like.
- Read it back and fix anything vague.

Watch out: put a review date on the checklist. If the way you work changes and the checklist does not, people stop trusting it.$t$,
   $t$Write your main job as a numbered checklist that someone new could follow.$t$,
   $t$Your core job is written as a checklist, in order, with a review date on it.$t$),
  ('delivery-checklist-and-tracker', 2, $t$Orders buried in chats get lost. One tracker shows everything in one place.

Do this:
- Pick one spreadsheet or board you already know how to use.
- Add columns: order or task, customer, owner, due date and status.
- Move every open order and task into it today.
- From now on, if it is not in the tracker, it does not exist. Move requests out of chats the day they arrive.

Watch out: the tracker holds names, addresses and order details. Keep it private, with limited access and a backup.$t$,
   $t$Set up one tracker and move every open order and task into it.$t$,
   $t$All open orders and tasks are in one tracker and none of them live only in a chat.$t$),
  ('delivery-checklist-and-tracker', 3, $t$A complaint tells you where your process breaks. Written down with its cause, it tells you what to change.

Do this:
- Start a complaint log with: date, customer, what went wrong, the cause and what you did.
- Log every complaint, including small ones and ones said in passing.
- Once a week, look for the cause that shows up most.
- Change the checklist or the tracker to stop that cause, and note the change.

Watch out: log the cause in the process, not a person's name.$t$,
   $t$Start a complaint log and record every complaint with its cause.$t$,
   $t$Every complaint since you started is in the log with a cause, and you have fixed the most common one in your process.$t$),
  ('delivery-checklist-and-tracker', 4, $t$The real test of a checklist is a day when you are not there.

Do this:
- Choose a normal working day and name who will run delivery.
- Give them the checklist and the tracker, and tell them to call you only for a real emergency.
- Do not step in. Write down what they ask and what goes wrong.
- Afterwards, fix the checklist wherever someone had to guess.

Watch out: a checklist does not replace training. Stay reachable the first time, and check the first few jobs.$t$,
   $t$Take one working day off and let someone run delivery from the checklist alone.$t$,
   $t$Someone else has run a job from your checklist without your help, and you have fixed what broke.$t$),

  -- ---------------------------------------------------------------- Invoicing and cash tracker
  ('invoicing-and-cash-tracker', 1, $t$If business and personal money mix, you cannot tell what the business really earns.

Do this:
- Open a business account or wallet, separate from your personal one.
- Point all customer payments to it.
- Pay business costs from it, and pay yourself a set amount out of it.
- Move any business spending still on personal cards over to it.

Watch out: this is not tax advice. Check your tax and record-keeping duties with a qualified accountant.$t$,
   $t$Open a business account and move all business income and costs through it.$t$,
   $t$All business money comes in and goes out through one account that is not your personal one.$t$),
  ('invoicing-and-cash-tracker', 2, $t$Revenue is not profit. Selling more of something that earns little can leave you worse off.

Do this:
- List every cost you pay to deliver each product or service: materials, time, fees and delivery.
- For each offer, subtract that cost from the price. The result is your profit on one sale.
- Mark the offer with the lowest profit.
- Decide what to do with it: raise its price, cut its cost, or stop selling it.

Watch out: count your own time as a cost, even if you do not pay yourself yet.$t$,
   $t$Work out the cost to deliver each offer and your profit on each sale.$t$,
   $t$You know the profit on each sale for every offer you sell, and which one earns the least.$t$),
  ('invoicing-and-cash-tracker', 3, $t$Late invoices become late payments. A fixed routine fixes both.

Do this:
- Send each invoice the day the work is done, with the amount, the due date and how to pay.
- Write three reminders once: before the due date, on the due date and a week after.
- Save them and send them on schedule, every time.
- Mark each invoice paid in your sheet the day the money arrives.

Watch out: keep reminders polite and accurate. Do not send them to people who have already paid or who dispute the invoice.$t$,
   $t$Send invoices the day the work is done and chase every late payment on a written schedule.$t$,
   $t$Invoices go out the day the work is done, and every late payment gets your written reminders on schedule.$t$),
  ('invoicing-and-cash-tracker', 4, $t$Cash problems grow quietly. A fixed weekly review catches them while they are small.

Do this:
- Pick a fixed time each week, for example Friday afternoon, and put it in your calendar.
- Check three numbers: money in, money out and money owed to you.
- Move a set amount into a buffer account each week until it covers one month of costs.
- Write down one action from the review, such as chasing an invoice.

Watch out: do not skip the review in a good week. That is when the habit slips.$t$,
   $t$Put a weekly money review in your calendar and set a weekly transfer to a buffer.$t$,
   $t$A weekly review of money in, money out and money owed is in your calendar and you have run it at least once.$t$),

  -- ---------------------------------------------------------------- Delegation pack
  ('delegation-pack', 1, $t$You cannot hand off what you have not listed.

Do this:
- For one normal week, write down every task you do, even the small ones.
- Next to each, ask: could someone else do this if I showed them?
- Mark the tasks only you can do, such as setting direction or meeting key customers.
- Mark the rest as tasks to hand off.

Watch out: be honest. "Only I can do it right" usually means "I have not written down how".$t$,
   $t$Write down everything you do in one week and mark which tasks only you can do.$t$,
   $t$Everything only you can do is listed, and every other task is marked to hand off.$t$),
  ('delegation-pack', 2, $t$Handing over a task makes you its manager. Handing over a whole function, with an owner, lets you stop thinking about it.

Do this:
- Choose one function from your hand-off list, such as packing orders or replying to customers.
- Write down who owns it, what good looks like and what they can decide without asking you.
- Walk the owner through it once, then let them run it.
- Check in on a set day each week, not every day.

Watch out: quality can drop while they learn, so tell them what you will check in the first few jobs. Handing work to staff or contractors has legal and contract implications, so check your obligations before you change anyone's duties.$t$,
   $t$Hand one function fully to a named owner, with a written standard.$t$,
   $t$One function has a named owner, a written standard for good work and a list of what they can decide alone.$t$),
  ('delegation-pack', 3, $t$If every refund and discount waits for you, you are still the bottleneck.

Do this:
- List the decisions people bring to you most: refunds, discounts, late deliveries and exceptions.
- For each, write a rule with a limit, for example "refund up to ₦X without asking".
- Share the rules with whoever makes these calls.
- When a decision falls outside the rules, add a new rule afterwards.

Watch out: accept their call inside the limits you wrote. Overriding it silently teaches them to wait for you.$t$,
   $t$Write rules for your most common routine decisions and share them with your team.$t$,
   $t$The routine decisions that used to wait for you each have a written rule and a limit.$t$),
  ('delegation-pack', 4, $t$An onboarding pack lets a new person start without taking your whole day.

Do this:
- Gather what a new person needs: your checklists, your decision rules, a contact list and who to ask for what.
- Put it in one folder or document.
- Walk one person through it, and time how long it takes until they can work alone.
- Fix every place they got stuck.

Watch out: do not put passwords in the pack. Share access separately, and remove it when someone leaves.$t$,
   $t$Put your onboarding pack together and walk one person through it.$t$,
   $t$A new person has walked through the pack, and you have fixed the places where they got stuck.$t$),

  -- ---------------------------------------------------------------- Automation and data safety
  ('automation-and-data-safety', 1, $t$A customer who cannot find you, or cannot pay you in a few steps, will leave.

Do this:
- Get a business domain and an email address on it, not a free mailbox.
- Make sure your business name, or the link you share, leads to one clear page.
- Give that page one way to pay online.
- Test it yourself from the start: find you, choose, pay, get a confirmation. Count the steps and fix anything confusing.

Watch out: use your payment provider's own checkout. Never take card details yourself.$t$,
   $t$Get a business domain and email, and make sure a customer can find you and pay online in one clear path. Test it yourself.$t$,
   $t$You have run your own test from finding you to paying, in one clear path, and fixed whatever confused you.$t$),
  ('automation-and-data-safety', 2, $t$Customer data scattered across phones and chats is lost when a phone is.

Do this:
- Choose one place for customer data, such as one spreadsheet or database.
- Move customer names and contacts into it, and stop keeping copies elsewhere.
- Turn on a backup, automatic if possible, and note how often it runs.
- Restore the backup into a test copy once. Time it and write down anything that was missing.

Watch out: a backup you have not restored is only a hope.$t$,
   $t$Put customer data in one place, set up a backup, and restore it into a test copy.$t$,
   $t$Customer data is in one place with a backup, and you have restored it once into a test copy.$t$),
  ('automation-and-data-safety', 3, $t$Tasks you repeat every week are the first ones to hand to software.

Do this:
- List the tasks you repeat most. Invoices, reminders and first replies are common.
- Pick the three that are simple and low-risk.
- Set each one to run on its own with a tool you already use.
- Keep a log of what each automation sends, and know how to switch it off.

Watch out: never automate a message you would not want a customer to read twice. Start with low-stakes tasks.$t$,
   $t$Pick your three most repeated tasks and set them to run automatically.$t$,
   $t$Three repeated tasks run on their own, you have a log of what they send, and you know how to stop them.$t$),
  ('automation-and-data-safety', 4, $t$Customer data comes with duties. Consent and sign-in security are the basics.

Do this:
- Add a short consent line wherever you collect customer data: forms, sign-up sheets and checkout.
- Write a short privacy notice that says what you collect, why, and how long you keep it.
- Turn on two-step sign-in for your email, bank, payment provider and tools.
- Replace any password that was ever shared in a chat.

Watch out: in Nigeria this includes the NDPA. Collect only what you need and have a plan if data leaks. This is not legal advice.$t$,
   $t$Add consent wherever you collect data, write a short privacy notice and turn on two-step sign-in everywhere.$t$,
   $t$Consent is collected wherever you collect data, a privacy notice is written, and two-step sign-in is on for your key accounts.$t$)
) as v(system_id, pos, body, action, done_when) on v.system_id = c.kit_system_id and v.pos = l.position
where lc.lesson_id = l.id
  and lc.done_when = ''
  and lc.body = lc.action;
