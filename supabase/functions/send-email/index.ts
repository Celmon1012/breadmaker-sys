// Send Email Hook for the shared Supabase at db.restart.ng.
//
// With the hook on, GoTrue stops sending auth emails and posts each one here instead, for
// every app on this Supabase. We pick the brand from where the link returns to:
//   - breadmakersystems.com -> Breadmaker Academy email via Resend from academy@breadmakersystems.com
//     (falls back to the shared SMTP under the Breadmaker name if Resend fails)
//   - anything else (Restart Console, local dev) -> Restart email via the shared SMTP
//
// Runs in the supabase-edge-functions container (mounted at /home/deno/functions/send-email).
// GoTrue calls it at https://db.restart.ng/functions/v1/send-email and signs every request, so
// the public route is safe: unsigned requests are rejected.
//
// Env (edge-functions container): SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY, SMTP_HOST,
// SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL, SMTP_SENDER_NAME; optional SUPABASE_PUBLIC_URL,
// BREADMAKER_EMAIL_FROM, SMTP_TLS_PORT (implicit-TLS port, default 465).
// Env (supabase-auth container): GOTRUE_HOOK_SEND_EMAIL_ENABLED=true,
// GOTRUE_HOOK_SEND_EMAIL_URI=https://db.restart.ng/functions/v1/send-email,
// GOTRUE_HOOK_SEND_EMAIL_SECRETS=<same value as SEND_EMAIL_HOOK_SECRET>.

import { serve } from 'https://deno.land/std@0.177.1/http/server.ts'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const env = (key: string, fallback = '') => Deno.env.get(key) || fallback

const HOOK_SECRET = env('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', '')
const API_URL = env('SUPABASE_PUBLIC_URL', 'https://db.restart.ng').replace(/\/$/, '')
const BREADMAKER_ORIGINS = ['https://breadmakersystems.com', 'https://www.breadmakersystems.com']
const BREADMAKER_FROM = env('BREADMAKER_EMAIL_FROM', 'Breadmaker Academy <academy@breadmakersystems.com>')
const RESTART_FROM = `${env('SMTP_SENDER_NAME', 'Restart Inc.')} <${env('SMTP_ADMIN_EMAIL')}>`

type Brand = 'breadmaker' | 'restart'

interface HookPayload {
  user: {
    email: string
    new_email?: string
    user_metadata?: Record<string, unknown>
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

interface Message {
  to: string
  subject: string
  html: string
  text: string
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: { http_code: 405, message: 'Method not allowed' } })

  const body = await req.text()

  // Preview mode, for the Restart console's Email page: renders the real templates with sample data
  // and sends nothing. It is not part of the auth hook: it needs this project's service-role key,
  // which only server-side code (the console's own functions) holds.
  if (new URL(req.url).searchParams.get('preview') === '1') return preview(req, body)

  let payload: HookPayload
  try {
    payload = new Webhook(HOOK_SECRET).verify(body, Object.fromEntries(req.headers)) as HookPayload
  } catch {
    return json(401, { error: { http_code: 401, message: 'Invalid signature' } })
  }

  const brand = pickBrand(payload)
  try {
    for (const message of buildMessages(brand, payload)) await send(brand, message)
    return json(200, {})
  } catch (error) {
    console.error(`send-email failed (${brand}, ${payload.email_data.email_action_type}):`, error)
    return json(500, { error: { http_code: 500, message: 'Could not send the email. Please try again shortly.' } })
  }
})

const SAMPLE_TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email_change', 'reauthentication', 'password_changed_notification']

function samePassword(given: string, expected: string) {
  if (!expected || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

async function preview(req: Request, body: string) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ') || !samePassword(auth.slice(7).trim(), env('SUPABASE_SERVICE_ROLE_KEY'))) {
    return json(401, { error: { http_code: 401, message: 'Invalid signature' } })
  }
  let brand: Brand = 'restart'
  try {
    if (JSON.parse(body || '{}')?.brand === 'breadmaker') brand = 'breadmaker'
  } catch {
    // keep the default brand
  }
  const redirect = brand === 'breadmaker' ? `${BREADMAKER_ORIGINS[0]}/auth/callback` : 'https://console.restart.ng/reset-password'
  const messages = SAMPLE_TYPES.flatMap((type) =>
    buildMessages(brand, {
      user: { email: 'you@example.com', new_email: type === 'email_change' ? 'new-address@example.com' : undefined, user_metadata: { first_name: 'Ade' } },
      email_data: {
        token: '482913',
        token_hash: 'sample-token-hash',
        redirect_to: redirect,
        email_action_type: type,
        site_url: redirect,
        token_hash_new: type === 'email_change' ? 'sample-token-hash-new' : undefined,
      },
    }).map((m, i) => ({ type: i === 0 ? type : `${type} (2nd email)`, to: m.to, subject: m.subject, html: m.html, text: m.text })),
  )
  return json(200, { brand, messages })
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function pickBrand({ user, email_data }: HookPayload): Brand {
  try {
    if (email_data.redirect_to && BREADMAKER_ORIGINS.includes(new URL(email_data.redirect_to).origin)) return 'breadmaker'
  } catch {
    // Not a URL; fall through.
  }
  // Emails without a return link (codes, notices) follow where the account was created.
  if (!email_data.redirect_to && user.user_metadata?.app === 'breadmaker') return 'breadmaker'
  return 'restart'
}

/** The link in the email. Breadmaker verifies on its own pages; Restart keeps GoTrue's verify URL. */
function actionLink(brand: Brand, tokenHash: string, type: string, redirectTo: string) {
  if (brand === 'breadmaker' && redirectTo) {
    const url = new URL(redirectTo)
    url.searchParams.set('token_hash', tokenHash)
    url.searchParams.set('type', type)
    return url.toString()
  }
  const url = new URL(`${API_URL}/auth/v1/verify`)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', type)
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

function buildMessages(brand: Brand, { user, email_data }: HookPayload): Message[] {
  const type = email_data.email_action_type
  const redirect = email_data.redirect_to
  const name = typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : ''
  const copy = COPY[brand]
  const hi = name ? `Hi ${escapeHtml(name)}. ` : ''

  switch (type) {
    case 'signup':
      return [render(brand, user.email, copy.signup.subject, {
        heading: copy.signup.heading,
        lines: [`${hi}${copy.signup.line}`],
        button: { label: copy.signup.button, url: actionLink(brand, email_data.token_hash, 'signup', redirect) },
        footnote: copy.signup.footnote,
      })]

    case 'recovery':
      return [render(brand, user.email, copy.recovery.subject, {
        heading: copy.recovery.heading,
        lines: [copy.recovery.line],
        button: { label: copy.recovery.button, url: actionLink(brand, email_data.token_hash, 'recovery', redirect) },
        footnote: copy.recovery.footnote,
      })]

    case 'invite':
      return [render(brand, user.email, copy.invite.subject, {
        heading: copy.invite.heading,
        lines: [copy.invite.line],
        button: { label: copy.invite.button, url: actionLink(brand, email_data.token_hash, 'invite', redirect) },
        footnote: copy.invite.footnote,
      })]

    case 'magiclink':
    case 'email':
      return [render(brand, user.email, copy.magiclink.subject, {
        heading: copy.magiclink.heading,
        lines: [copy.magiclink.line],
        button: { label: copy.magiclink.button, url: actionLink(brand, email_data.token_hash, 'magiclink', redirect) },
        code: email_data.token,
        footnote: copy.magiclink.footnote,
      })]

    case 'email_change': {
      // GoTrue's field names are swapped here for backward compatibility: the current address
      // pairs with token_hash_new, the new address with token_hash.
      const messages: Message[] = []
      const secure = !!(email_data.token_hash && email_data.token_hash_new)
      const changeEmail = (to: string, hash: string, line: string) =>
        render(brand, to, copy.emailChange.subject, {
          heading: copy.emailChange.heading,
          lines: [line],
          button: { label: copy.emailChange.button, url: actionLink(brand, hash, 'email_change', redirect) },
          footnote: copy.emailChange.footnote,
        })
      if (secure) {
        messages.push(changeEmail(user.email, email_data.token_hash_new!, copy.emailChange.currentLine(user.new_email ?? '')))
        if (user.new_email) messages.push(changeEmail(user.new_email, email_data.token_hash, copy.emailChange.newLine))
      } else {
        const hash = email_data.token_hash || email_data.token_hash_new || ''
        messages.push(changeEmail(user.new_email || user.email, hash, copy.emailChange.newLine))
      }
      return messages
    }

    case 'reauthentication':
      return [render(brand, user.email, copy.code.subject, {
        heading: copy.code.heading,
        lines: [copy.code.line],
        code: email_data.token,
        footnote: copy.code.footnote,
      })]

    default:
      // Security notices (password changed, identity linked, MFA changes, ...).
      return [render(brand, user.email, copy.notice.subject, {
        heading: copy.notice.heading,
        lines: [NOTICES[type] ?? copy.notice.line],
        footnote: copy.notice.footnote,
      })]
  }
}

const NOTICES: Record<string, string> = {
  password_changed_notification: 'The password on your account was just changed.',
  email_changed_notification: 'The email address on your account was just changed.',
  phone_changed_notification: 'The phone number on your account was just changed.',
  identity_linked_notification: 'A new sign-in method was linked to your account.',
  identity_unlinked_notification: 'A sign-in method was removed from your account.',
  mfa_factor_enrolled_notification: 'A new two-step verification method was added to your account.',
  mfa_factor_unenrolled_notification: 'A two-step verification method was removed from your account.',
}

const COPY = {
  breadmaker: {
    signup: {
      subject: 'Confirm your email',
      heading: 'Confirm your email.',
      line: 'One step and your learning space is ready. Confirm this address to open your sessions and keep your progress.',
      button: 'Confirm my email',
      footnote: "If you didn't create a Breadmaker Academy account, you can ignore this email.",
    },
    recovery: {
      subject: 'Reset your password',
      heading: 'Reset your password.',
      line: 'Use the button below to choose a new password. The link works once and expires soon.',
      button: 'Choose a new password',
      footnote: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    },
    invite: {
      subject: "You're invited to Breadmaker Academy",
      heading: "You're invited.",
      line: 'You have a place in Breadmaker Academy. Accept the invitation to set up your account and open your program.',
      button: 'Accept invitation',
      footnote: "If you weren't expecting this, you can ignore this email.",
    },
    magiclink: {
      subject: 'Your Breadmaker Academy sign-in link',
      heading: 'Sign in to Breadmaker Academy.',
      line: 'Use the button below to sign in. The link works once and expires soon.',
      button: 'Sign me in',
      footnote: "If you didn't try to sign in, you can ignore this email.",
    },
    emailChange: {
      subject: 'Confirm your new email address',
      heading: 'Confirm your email change.',
      currentLine: (to: string) => `You asked to change the email on your Breadmaker Academy account${to ? ` to ${escapeHtml(to)}` : ''}. Confirm to go ahead.`,
      newLine: 'Confirm this address to use it for your Breadmaker Academy account.',
      button: 'Confirm email change',
      footnote: "If you didn't ask for this change, reset your password straight away.",
    },
    code: {
      subject: 'Your Breadmaker Academy verification code',
      heading: 'Your verification code.',
      line: 'Enter this code to confirm it is you.',
      footnote: "If you didn't ask for a code, you can ignore this email.",
    },
    notice: {
      subject: 'A change to your Breadmaker Academy account',
      heading: 'Your account was updated.',
      line: 'There was a change to your account.',
      footnote: "If this wasn't you, reset your password straight away.",
    },
  },
  restart: {
    signup: {
      subject: 'Confirm your email',
      heading: 'Confirm your email',
      line: 'Confirm this address to finish setting up your Restart console.',
      button: 'Confirm email',
      footnote: "If you didn't create a Restart account, you can ignore this email.",
    },
    recovery: {
      subject: 'Reset your password',
      heading: 'Reset your password',
      line: 'Use the button below to set a new password for your Restart console. The link works once and expires soon.',
      button: 'Set a new password',
      footnote: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    },
    invite: {
      subject: 'Your Restart console invitation',
      heading: "You've been invited",
      line: 'You have been invited to a Restart console. Accept the invitation to set your password and get started.',
      button: 'Accept invitation',
      footnote: "If you weren't expecting this, you can ignore this email.",
    },
    magiclink: {
      subject: 'Your Restart sign-in link',
      heading: 'Sign in to Restart',
      line: 'Use the button below to sign in to your console. The link works once and expires soon.',
      button: 'Sign in',
      footnote: "If you didn't try to sign in, you can ignore this email.",
    },
    emailChange: {
      subject: 'Confirm your email change',
      heading: 'Confirm your email change',
      currentLine: (to: string) => `You asked to change the email on your Restart account${to ? ` to ${escapeHtml(to)}` : ''}. Confirm to go ahead.`,
      newLine: 'Confirm this address to use it for your Restart account.',
      button: 'Confirm email change',
      footnote: "If you didn't ask for this change, reset your password straight away.",
    },
    code: {
      subject: 'Your Restart verification code',
      heading: 'Your verification code',
      line: 'Enter this code to confirm it is you.',
      footnote: "If you didn't ask for a code, you can ignore this email.",
    },
    notice: {
      subject: 'A change to your Restart account',
      heading: 'Your account was updated',
      line: 'There was a change to your account.',
      footnote: "If this wasn't you, reset your password straight away.",
    },
  },
}

interface Content {
  heading: string
  lines: string[]
  button?: { label: string; url: string }
  code?: string
  footnote: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function unescapeHtml(value: string) {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e as string]!)
}

function render(brand: Brand, to: string, subject: string, content: Content): Message {
  // `lines` are HTML: user-supplied values (names, addresses) are escaped where they're inserted.
  const html = brand === 'breadmaker' ? breadmakerHtml(content) : restartHtml(content)
  const text = [
    content.heading,
    '',
    ...content.lines.map(unescapeHtml),
    ...(content.code ? ['', `Code: ${content.code}`] : []),
    ...(content.button ? ['', `${content.button.label}: ${content.button.url}`] : []),
    '',
    content.footnote,
  ].join('\n')
  return { to, subject, html, text }
}

function breadmakerHtml({ heading, lines, button, code, footnote }: Content) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F1E6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1E6;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1E1B16;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 8px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:21px;font-weight:700;letter-spacing:-0.01em;">Breadmaker <span style="color:#A24712;">Academy</span></td></tr>
<tr><td style="background:#FEFDF8;border:1px solid #E8E2D3;border-radius:24px;padding:36px 32px;">
<h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:700;line-height:1.15;letter-spacing:-0.02em;">${heading}</h1>
${lines.map((l) => `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#5B544A;">${l}</p>`).join('\n')}
${code ? `<p style="margin:0 0 24px;font-size:30px;letter-spacing:8px;font-weight:bold;color:#1E1B16;">${code}</p>` : ''}
${button ? `<a href="${escapeHtml(button.url)}" style="display:inline-block;background:#A24712;color:#F8F4E9;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:999px;">${button.label}</a>` : ''}
<p style="margin:28px 0 0;font-size:13.5px;line-height:1.6;color:#5B544A;">${footnote}</p>
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12.5px;color:#5B544A;">Breadmaker Academy · breadmakersystems.com</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function restartHtml({ heading, lines, button, code, footnote }: Content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#F3F4F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F4;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0B0B0C;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0B0B0C;padding:22px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><div style="width:28px;height:28px;line-height:28px;background:#2DE2C4;border-radius:6px;text-align:center;font-size:17px;font-weight:bold;color:#0B0B0C;">R</div></td>
<td style="padding-left:10px;font-size:20px;font-weight:bold;color:#FFFFFF;letter-spacing:0;">Restart</td>
</tr></table>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;letter-spacing:0;word-spacing:normal;">${heading}</h1>
${lines.map((l) => `<p style="margin:0 0 24px;font-size:15.5px;line-height:1.6;color:#4A4F55;">${l}</p>`).join('\n')}
${code ? `<p style="margin:0 0 24px;font-size:30px;letter-spacing:8px;font-weight:bold;color:#0B0B0C;">${code}</p>` : ''}
${button ? `<a href="${escapeHtml(button.url)}" style="display:inline-block;background:#2DE2C4;color:#0B0B0C;text-decoration:none;font-size:15.5px;font-weight:bold;padding:13px 26px;border-radius:10px;">${button.label} &rarr;</a>
<p style="margin:20px 0 0;font-size:12.5px;line-height:1.6;color:#6B7178;">Button not working? Copy this link into your browser:<br><span style="word-break:break-all;color:#4A4F55;">${escapeHtml(button.url)}</span></p>` : ''}
<p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#6B7178;">${footnote}</p>
</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #ECEDEE;font-size:12px;color:#8A9096;">Restart Inc. · console.restart.ng</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

async function send(brand: Brand, message: Message) {
  if (brand === 'breadmaker') {
    try {
      await sendWithResend(BREADMAKER_FROM, message)
      return
    } catch (error) {
      // Keep sign-ups working if Resend is down or the domain isn't verified yet.
      console.error('Resend failed, falling back to SMTP:', error)
      await sendWithSmtp(`Breadmaker Academy <${env('SMTP_ADMIN_EMAIL')}>`, message)
      return
    }
  }
  await sendWithSmtp(RESTART_FROM, message)
}

async function sendWithResend(from: string, message: Message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  })
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`)
}

async function sendWithSmtp(from: string, message: Message) {
  // The edge runtime can't upgrade a plain connection (STARTTLS on 587 fails with "Bad resource ID"),
  // so connect with implicit TLS on 465. GoTrue's own SMTP_PORT is left alone.
  const client = new SMTPClient({
    connection: {
      hostname: env('SMTP_HOST'),
      port: Number(env('SMTP_TLS_PORT', '465')),
      tls: true,
      auth: { username: env('SMTP_USER'), password: env('SMTP_PASS') },
    },
  })
  try {
    await client.send({ from, to: message.to, subject: message.subject, content: message.text, html: message.html })
  } finally {
    await client.close()
  }
}
