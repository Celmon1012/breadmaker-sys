/**
 * supabase-js reports any non-2xx edge function reply as the generic
 * "Edge Function returned a non-2xx status code". The real reason is in the
 * response body, so read it and fall back to the generic text only if there is none.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = body?.error ?? body?.message ?? body?.msg;
      if (typeof message === 'string' && message) return message;
    } catch {
      /* not JSON: use the fallback */
    }
  }
  const generic = (error as Error | null)?.message;
  return generic && !/non-2xx/i.test(generic) ? generic : fallback;
}
