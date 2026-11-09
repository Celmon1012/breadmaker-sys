// Builds and deploys the custom site for a Launchpad application from its funnel brief.
//
//   POST { application_id, action: 'build' | 'approve', allow_placeholders? }
//        -> { ok, status, site_url, repo_url, placeholders }
//
// Callers: owners and coaches in the Studio (their own session token), or the database and launchpad-portal
// (header x-cron-secret) for 'build' on a job that has been paid. Only the team can approve.
//
//   build    Creates a private repo from the funnel template in the organisation (first time), writes
//            funnel.json from the brief, and creates or redeploys the Coolify application at
//            <slug>.<SITES_DOMAIN>. The site is noindex until it is approved. Status becomes 'review'.
//            Running it again rewrites funnel.json from the current brief and redeploys.
//   approve  Flips the site to indexable, redeploys, and sets the status to 'live'. If the brief still has
//            "[placeholder]" gaps the call is refused with 409 unless allow_placeholders is true.
//
// Everything it did is appended to build_jobs.log and the links are kept in build_jobs.outputs.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      COOLIFY_API_URL (https://cp.restart.ng, shared with deploy-restart), COOLIFY_API_TOKEN (permissions: read, write, deploy),
//      SITES_DOMAIN (e.g. breadmaker.site), GitHub access (see _shared/github.ts).
// Optional: COOLIFY_PROJECT_UUID, COOLIFY_SERVER_UUID, COOLIFY_ENVIRONMENT, COOLIFY_GITHUB_APP_UUID,
//      COOLIFY_DESTINATION_UUID, FUNNEL_LEAD_ENDPOINT.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { admin, corsHeaders, env, json } from '../_shared/flutterwave.ts';
import { buildFunnel, placeholdersIn, siteSlug } from '../_shared/funnel.ts';
import { createFromTemplate, githubOrg, putFile, syncBuilder } from '../_shared/github.ts';
import { coolify, deployApp, sitesDomain } from '../_shared/coolify.ts';
import { emailHtml, sendMail } from '../_shared/mail.ts';

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let jobId = '';
  const db = admin();
  const note = async (step: string, ok: boolean, detail: string, patch: Record<string, unknown> = {}) => {
    if (!jobId) return;
    const { data } = await db.from('build_jobs').select('log, outputs').eq('id', jobId).single();
    const log = [...(Array.isArray(data?.log) ? data!.log : []), { at: new Date().toISOString(), step, ok, detail }];
    await db.from('build_jobs').update({ log, updated_at: new Date().toISOString(), ...patch }).eq('id', jobId);
  };

  try {
    // Who is asking: the database or launchpad-portal (shared secret, builds only, and only for a paid job),
    // or an owner or coach in the Studio.
    const cronSecret = env('CRON_SECRET');
    const internal = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
    if (!internal) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader) return json({ error: 'Sign in to the Studio.' }, 401);
      const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
        auth: { persistSession: false },
        db: { schema: 'breadmaker' },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await asUser.auth.getUser(authHeader.replace(/^Bearer /i, ''));
      if (userError || !userData?.user) return json({ error: 'Sign in to the Studio.' }, 401);
      const { data: canEdit } = await asUser.rpc('can_edit_content');
      if (!canEdit) return json({ error: 'Only owners and coaches can build and approve sites.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = clip(body.application_id, 64);
    const action = clip(body.action, 20);
    if (!applicationId || !['build', 'approve'].includes(action)) return json({ error: 'Send application_id and an action of build or approve.' }, 400);
    if (internal && action !== 'build') return json({ error: 'Only the team can approve a site.' }, 403);

    const { data: application } = await db
      .from('applications')
      .select('id, program, name, email, phone, company, answers')
      .eq('id', applicationId)
      .maybeSingle();
    if (!application || application.program !== 'launchpad') return json({ error: 'Launchpad application not found.' }, 404);

    const { data: job } = await db
      .from('build_jobs')
      .select('id, platform, status, brief, page_data, outputs, site_slug, custom_domain, domain_status, paid_at, access_token, lead_key')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (!job) return json({ error: 'This application has no build job yet.' }, 404);
    jobId = job.id;
    if (!job.brief) return json({ error: 'Write the funnel brief first.' }, 400);
    if (job.platform && job.platform !== 'custom') return json({ error: `Automatic builds only cover custom sites for now. This one is ${job.platform}.` }, 400);
    // The applicant's payment confirms the brief and releases the build. The team can still build by hand.
    if (internal && !job.paid_at) return json({ error: 'This build is not paid yet.' }, 402);

    const domain = sitesDomain();
    const outputs = { ...(job.outputs as Record<string, any>) };
    // The address is kept once a site exists; before that it is the one the applicant chose, or a generated one.
    const slug: string = job.site_slug || outputs.slug || siteSlug(application);
    const hosts = [`${slug}.${domain}`, ...(job.custom_domain && job.domain_status === 'verified' ? [job.custom_domain] : [])];
    const repo = outputs.repo || `lp-${slug}`;
    const siteUrl = `https://${slug}.${domain}`;
    const repoUrl = `https://github.com/${githubOrg()}/${repo}`;
    const placeholders = placeholdersIn(job.page_data && !job.brief?.scorecard ? job.page_data : job.brief);
    // The funnel's form always posts to our funnel-lead function, which saves the enquiry and passes it to the owner's
    // Kumoda lead form (or emails them), so the page never changes when Kumoda is connected and never shows Kumoda's address.
    const leadEndpoint = `${env('SUPABASE_PUBLIC_URL', 'https://db.restart.ng').replace(/\/$/, '')}/functions/v1/funnel-lead?k=${job.lead_key}`;

    // ---- approve -------------------------------------------------------------------------------------------
    if (action === 'approve') {
      if (!outputs.coolify_uuid) return json({ error: 'Build the site first.' }, 400);
      if (placeholders.length && body.allow_placeholders !== true) {
        return json({ error: 'The brief still has gaps.', placeholders }, 409);
      }
      const funnel = buildFunnel(job.brief, application, { indexable: true, leadEndpoint, page: job.page_data });
      await syncBuilder(repo);
      await putFile(repo, 'funnel.json', JSON.stringify(funnel, null, 2) + '\n', 'Approve: make the site indexable');
      await deployApp(outputs.coolify_uuid);
      outputs.indexable = true;
      await note('approve', true, 'indexable, redeploying', { status: 'live', outputs });
      return json({ ok: true, status: 'live', site_url: siteUrl, repo_url: repoUrl, placeholders });
    }

    // ---- build ---------------------------------------------------------------------------------------------
    await db.from('build_jobs').update({ status: 'building', updated_at: new Date().toISOString() }).eq('id', jobId);
    // A site that was approved stays indexable when it is rebuilt from an updated brief.
    const indexable = outputs.indexable === true;
    const funnel = buildFunnel(job.brief, application, { indexable, leadEndpoint, page: job.page_data });
    const funnelText = JSON.stringify(funnel, null, 2) + '\n';

    if (!outputs.repo) {
      await createFromTemplate(repo, `Launchpad site for ${funnel.brand.name}`);
      outputs.repo = repo;
      outputs.slug = slug;
      outputs.repo_url = repoUrl;
      await note('repo', true, `created ${githubOrg()}/${repo} from the template`, { outputs });
    }
    // The site's builder is a copy of the template: refresh it first, so the page written next is built with current blocks.
    const synced = await syncBuilder(repo);
    if (synced.length) await note('builder', true, `updated ${synced.join(', ')} from the template`);
    await putFile(repo, 'funnel.json', funnelText, 'Update funnel.json from the brief');
    await note('funnel', true, `funnel.json written (${indexable ? 'indexable' : 'noindex'})`);

    if (!outputs.coolify_uuid) {
      const created = await coolify('/applications/private-github-app', {
        method: 'POST',
        body: JSON.stringify({
          project_uuid: env('COOLIFY_PROJECT_UUID', 'xgs48ko4gk044kw4ww0oo48g'),
          server_uuid: env('COOLIFY_SERVER_UUID', 'gs8ck00448o40sw4okgsck0g'),
          environment_name: env('COOLIFY_ENVIRONMENT', 'production'),
          github_app_uuid: env('COOLIFY_GITHUB_APP_UUID', 'dxkilc4ziskogihzrmofd2vu'),
          ...(env('COOLIFY_DESTINATION_UUID') ? { destination_uuid: env('COOLIFY_DESTINATION_UUID') } : {}),
          git_repository: `${githubOrg()}/${repo}`,
          git_branch: 'main',
          build_pack: 'nixpacks',
          ports_exposes: '80',
          name: `launchpad-${slug}`,
          description: `Launchpad site for ${funnel.brand.name}`,
          domains: hosts.map((host) => `https://${host}`).join(','),
          is_static: true,
          publish_directory: '/dist',
          install_command: 'npm install',
          build_command: 'npm run build',
          instant_deploy: true,
        }),
      });
      if (created.status >= 300 || !created.data?.uuid) {
        throw new Error(`Coolify refused to create the app (${created.status}): ${created.data?.message ?? JSON.stringify(created.data ?? {}).slice(0, 200)}`);
      }
      outputs.coolify_uuid = created.data.uuid;
      outputs.site_url = siteUrl;
      await note('deploy', true, `created Coolify app ${created.data.uuid} at ${siteUrl}`, { outputs });
    } else {
      const redeploy = await deployApp(outputs.coolify_uuid);
      if (redeploy.status >= 300) throw new Error(`Coolify could not redeploy (${redeploy.status}).`);
      await note('deploy', true, 'redeploying');
    }

    outputs.placeholders = placeholders;
    const finalStatus = indexable ? 'live' : 'review';

    // Tell a paying applicant their preview is on its way, once.
    if (job.paid_at && !outputs.preview_emailed) {
      const first = String(application.name).trim().split(/\s+/)[0] || 'there';
      const portal = `${env('PUBLIC_SITE_URL', 'https://breadmakersystems.com').replace(/\/$/, '')}/launchpad/brief/${job.access_token}`;
      const paragraphs = [
        `Hi ${first}, thank you. Your funnel is being built from the brief you approved. Your preview is at ${siteUrl}; give it a few minutes on the first visit.`,
        'Look it over and ask for changes from your funnel page. We review it before it goes live to search engines.',
      ];
      outputs.preview_emailed = await sendMail(application.email, 'Your funnel preview is on its way', emailHtml('Your funnel is being built', paragraphs, { label: 'Open your funnel page', url: portal }), `${paragraphs.join('\n\n')}\n\n${portal}`);
    }
    // The customer may have asked for Kumoda while this build ran: keep what the portal saved.
    const { data: latest } = await db.from('build_jobs').select('outputs').eq('id', jobId).single();
    const kumoda = (latest?.outputs as Record<string, any> | null)?.kumoda;
    if (kumoda) outputs.kumoda = kumoda;
    await db.from('build_jobs').update({ status: finalStatus, outputs, updated_at: new Date().toISOString() }).eq('id', jobId);
    return json({ ok: true, status: finalStatus, site_url: siteUrl, repo_url: repoUrl, placeholders });
  } catch (error) {
    const message = (error as Error).message || 'The build failed.';
    console.error('build-deploy', message);
    await note('error', false, message, { status: 'failed' }).catch(() => undefined);
    return json({ error: message }, 502);
  }
});
