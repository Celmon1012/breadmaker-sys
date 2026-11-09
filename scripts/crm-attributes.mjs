// Creates (or updates) the custom attributes Breadmaker needs in Evo CRM. Safe to re-run.
//
//   CRM_API_URL=https://api-crm.restart.ng CRM_SERVICE_TOKEN=... node scripts/crm-attributes.mjs
//
// contact_attribute       = fields on the person (shown on the contact card, usable in filters)
// pipeline_item_attribute = fields on a deal card in a pipeline
// The keys here are the ones supabase/functions/crm-sync writes. Change them together.

const base = (process.env.CRM_API_URL ?? '').replace(/\/$/, '');
const token = process.env.CRM_SERVICE_TOKEN ?? '';
if (!base || !token) {
  console.error('Set CRM_API_URL and CRM_SERVICE_TOKEN.');
  process.exit(1);
}

const t = (key, name, description) => ({ key, name, description, type: 'text' });
const n = (key, name, description) => ({ key, name, description, type: 'number' });
const d = (key, name, description) => ({ key, name, description, type: 'date' });
const c = (key, name, description) => ({ key, name, description, type: 'checkbox' });
const l = (key, name, description, values) => ({ key, name, description, type: 'list', values });

const contact = [
  // Where they came from and where they are in the journey
  l('lead_channel', 'Lead channel', 'The first entry point: which form or page brought them in.', [
    'newsletter', 'contact_form', 'application', 'waitlist', 'leak_test', 'partner_application', 'system_interest', 'purchase',
    'signup', 'support', 'kumoda',
  ]),
  t('lead_source', 'Lead source detail', 'Exact source tag from the site, for example guide:pricing or tools.'),
  l('lifecycle_stage', 'Lifecycle stage', 'Furthest point reached: subscriber, lead, applicant, customer or partner.', [
    'subscriber', 'lead', 'applicant', 'customer', 'partner',
  ]),
  l('interest_program', 'Programme of interest', 'The programme they asked about or applied to.', ['foundry', 'launchpad', 'general']),
  t('systems_interested', 'Systems they asked about', 'Systems still in testing they asked to be told about, comma separated.'),

  // Business Leak Test
  l('biggest_leak', 'Biggest leak', 'The Leak Test pillar costing them most.', ['offer', 'sales', 'operations', 'cash', 'team', 'tech']),
  n('leak_test_score', 'Leak Test score', 'Total score out of 100. Higher is healthier.'),
  t('leak_test_band', 'Leak Test band', 'Score band from the Leak Test.'),
  t('leak_test_archetype', 'Leak Test archetype', 'Business archetype from the Leak Test.'),
  n('leak_owner_dependence', 'Owner dependence', 'How much the business depends on the owner (Leak Test).'),
  l('leak_report_tier', 'Leak report bought', 'Paid Leak Test tier, if any.', ['report', 'report_call']),
  d('leak_test_taken_at', 'Leak Test taken', 'When they took the Leak Test.'),

  // About their business
  t('business_name', 'Business name', 'Company or business name they gave.'),
  t('business_industry', 'Industry', 'Industry from the Leak Test or application.'),
  t('business_age', 'Business age', 'How long the business has operated.'),
  t('team_size', 'Team size', 'Team size band.'),
  t('revenue_band', 'Revenue band', 'Revenue band they selected.'),
  t('main_goal', 'Main goal', 'What they said they want most.'),
  t('whatsapp', 'WhatsApp', 'WhatsApp number as typed on the form.'),

  // Email consent
  c('newsletter_subscribed', 'Newsletter consent', 'Ticked the box to receive guides and updates.'),
  d('newsletter_consented_at', 'Consented on', 'When they gave email consent.'),
  c('newsletter_unsubscribed', 'Unsubscribed', 'They opted out. Do not email.'),

  // Applications and partners
  l('application_program', 'Applied to', 'Programme of their latest application.', ['foundry', 'launchpad', 'general']),
  t('application_tier', 'Support level', 'Self-paced, guided or done-with-you.'),
  l('application_status', 'Application status', 'Where their latest application stands.', [
    'new', 'reviewed', 'accepted', 'invoiced', 'paid', 'enrolled', 'declined',
  ]),
  d('applied_at', 'Applied on', 'When they last applied.'),
  t('partner_needs', 'Partner needs', 'What they said they need from a Prestige Partner plan.'),

  // Lead quality
  n('lead_score', 'Lead score', 'How sales-ready this lead looks, 0 to 100. Only ever rises.'),
  l('lead_priority', 'Lead priority', 'hot (70+), warm (40+) or cold, from the lead score.', ['hot', 'warm', 'cold']),

  // Where they came from (campaign tags the site recorded)
  t('first_touch_source', 'First touch: source', 'utm_source on their first visit, or "direct".'),
  t('first_touch_medium', 'First touch: medium', 'utm_medium on their first visit.'),
  t('first_touch_campaign', 'First touch: campaign', 'utm_campaign on their first visit.'),
  t('first_touch_referrer', 'First touch: referrer', 'Website that sent them first.'),
  t('first_touch_landing', 'First touch: landing page', 'First page they saw.'),
  t('last_touch_source', 'Last touch: source', 'utm_source on their most recent campaign visit.'),
  t('last_touch_medium', 'Last touch: medium', 'utm_medium on their most recent campaign visit.'),
  t('last_touch_campaign', 'Last touch: campaign', 'utm_campaign on their most recent campaign visit.'),

  // Learner, member and support lifecycle
  d('signed_up_at', 'Signed up on', 'When they created an Academy account.'),
  t('courses_enrolled', 'Courses enrolled', 'Courses they are enrolled in, comma separated.'),
  t('membership_plan', 'Membership plan', 'Breadmaker Hub or Partner plan code.'),
  d('membership_ends_at', 'Membership ends', 'End of their current paid period.'),
  c('membership_active', 'Membership active', 'Their paid period has not ended.'),
  c('support_open', 'Open support ticket', 'They have a ticket that is not resolved.'),
  d('support_last_ticket_at', 'Last ticket on', 'When they last opened a support ticket.'),
  t('support_last_subject', 'Last ticket subject', 'Subject of their latest support ticket.'),

  // Kumoda (the WhatsApp platform): their own account, if they use it
  n('kumoda_client_id', 'Kumoda client id', 'Id of their Kumoda client account.'),
  t('kumoda_plan', 'Kumoda plan', 'Plan on their Kumoda account, blank if none.'),
  t('kumoda_status', 'Kumoda status', 'active or inactive.'),
  d('kumoda_signed_up', 'Kumoda signed up', 'When they created their Kumoda account.'),
  n('kumoda_workspaces', 'Kumoda workspaces', 'Number of Kumoda workspaces.'),
  d('kumoda_last_message_at', 'Kumoda last message', 'Last message sent through Kumoda. Blank means never activated.'),

  // Money
  d('first_paid_at', 'First paid on', 'Date of their first successful payment.'),
  t('last_payment_program', 'Last payment: programme', 'Programme of their latest successful payment.'),
  t('last_payment_tier', 'Last payment: tier', 'Tier of their latest successful payment.'),
];

const item = [
  t('entry_point', 'Entry point', 'Which form created this deal.'),
  t('program', 'Programme', 'Programme this deal is about.'),
  t('tier', 'Support level', 'Support level requested.'),
  t('application_status', 'Application status', 'Status on the site.'),
  t('message', 'Message', 'What they wrote on the contact form.'),
  t('needs', 'Needs', 'What a partner applicant said they need.'),
  t('answers_summary', 'Application answers', 'Every answer from the application form, as "question: answer" lines.'),
  n('leak_score', 'Leak Test score', 'Score out of 100 when this deal was created.'),
  t('leak_band', 'Leak Test band', 'Band when this deal was created.'),
  t('source_record_id', 'Site record id', 'Id of the row on the Breadmaker site, for support.'),
];

async function call(method, path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  return json;
}

const existing = (await call('GET', '/custom_attribute_definitions?per_page=500')).data ?? [];
let created = 0;
let updated = 0;

for (const [model, defs] of [['contact_attribute', contact], ['pipeline_item_attribute', item]]) {
  for (const def of defs) {
    const payload = {
      custom_attribute_definition: {
        attribute_display_name: def.name,
        attribute_description: def.description,
        attribute_display_type: def.type,
        attribute_key: def.key,
        attribute_model: model,
        ...(def.values ? { attribute_values: def.values } : {}),
      },
    };
    const found = existing.find((e) => e.attribute_key === def.key && e.attribute_model === model);
    if (found) {
      await call('PATCH', `/custom_attribute_definitions/${found.id}`, payload);
      updated += 1;
    } else {
      await call('POST', '/custom_attribute_definitions', payload);
      created += 1;
    }
    console.log(`${found ? 'updated' : 'created'}  ${model}  ${def.key}`);
  }
}
console.log(`Done: ${created} created, ${updated} updated.`);
