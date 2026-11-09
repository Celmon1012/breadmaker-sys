// Opens a Kumoda account for a Launchpad customer and connects their funnel (Kumoda's partner provisioning
// endpoint, POST /api/provision/v1/accounts; see docs/PROVISIONING.md in the Kumoda repo).
//
// Env: KUMODA_PROVISION_KEY (the same value as PROVISIONING_KEY on Kumoda); optional KUMODA_PROVISION_URL
// (default https://kumoda.io/api/provision/v1/accounts).
import { env } from './flutterwave.ts';

export interface KumodaAccount {
  created: boolean;
  workspaceId: number;
  leadFormUrl: string;
  /** One-time sign-in link, only for a brand new account. */
  loginUrl: string | null;
  dashboardUrl: string;
}

export const kumodaProvisioningConfigured = () => !!env('KUMODA_PROVISION_KEY');

export async function provisionKumoda(input: { name: string; email: string; phone?: string | null; funnelName: string; funnelUrl?: string | null }): Promise<KumodaAccount> {
  const key = env('KUMODA_PROVISION_KEY');
  if (!key) throw new Error('Kumoda provisioning is not set up (KUMODA_PROVISION_KEY).');
  const response = await fetch(env('KUMODA_PROVISION_URL', 'https://kumoda.io/api/provision/v1/accounts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Provision-Key': key },
    body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone || undefined, funnel_name: input.funnelName, funnel_url: input.funnelUrl || undefined }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.lead_form_url) {
    throw new Error(`Kumoda did not set up the account (${response.status}): ${data?.error ?? data?.message ?? 'no details'}`);
  }
  return {
    created: !!data.created,
    workspaceId: Number(data.workspace_id),
    leadFormUrl: String(data.lead_form_url),
    loginUrl: data.login_url ? String(data.login_url) : null,
    dashboardUrl: String(data.dashboard_url ?? ''),
  };
}
