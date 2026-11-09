import React, { useEffect, useState } from 'react';
import { Camera, KeyRound, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { COUNTRIES } from '../../lib/countries';
import { getConfirmedLocation } from '../../lib/currency';
import Avatar, { useMyAvatar } from './Avatar';
import { removeAvatar, uploadAvatar } from '../../lib/avatar';
import { Button, CARD, Field, LearnerLayout, Notice, PageContainer, PageTitle, Select, TextArea, TextInput } from './lms-ui';

interface ProfilePageProps {
  onNavigate: (route: Route) => void;
}

const EMPTY = {
  first_name: '',
  last_name: '',
  phone: '',
  mobile: '',
  country: '',
  city: '',
  business_name: '',
  website: '',
  bio: '',
};
type Values = typeof EMPTY;

const BIO_LIMIT = 500;

/**
 * The learner's own details. Name and WhatsApp number live on profiles; the rest (country, mobile, business,
 * bio) live in profile_details, which only the owner can read. If that table is not set up yet, the extra
 * fields are hidden and the form still saves name and WhatsApp.
 */
export default function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user } = useAuth();
  const [values, setValues] = useState<Values>(EMPTY);
  const [detailsReady, setDetailsReady] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profile, details] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, phone').eq('id', user.id).maybeSingle(),
        supabase
          .from('profile_details')
          .select('country, city, mobile, business_name, website, bio')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (details.error) setDetailsReady(false);
      setValues({
        first_name: profile.data?.first_name ?? '',
        last_name: profile.data?.last_name ?? '',
        phone: profile.data?.phone ?? '',
        mobile: details.data?.mobile ?? '',
        country: details.data?.country ?? getConfirmedLocation()?.country ?? '',
        city: details.data?.city ?? '',
        business_name: details.data?.business_name ?? '',
        website: details.data?.website ?? '',
        bio: details.data?.bio ?? '',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const trimmed = (value: string) => value.trim() || null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setStatus('saving');
    setError(null);

    const profileResult = await supabase
      .from('profiles')
      .update({ first_name: trimmed(values.first_name), last_name: trimmed(values.last_name), phone: trimmed(values.phone) })
      .eq('id', user.id);
    if (profileResult.error) {
      setError(profileResult.error.message);
      setStatus('idle');
      return;
    }

    if (detailsReady) {
      const detailsResult = await supabase.from('profile_details').upsert({
        user_id: user.id,
        country: trimmed(values.country),
        city: trimmed(values.city),
        mobile: trimmed(values.mobile),
        business_name: trimmed(values.business_name),
        website: trimmed(values.website),
        bio: trimmed(values.bio),
        updated_at: new Date().toISOString(),
      });
      if (detailsResult.error) {
        setError(detailsResult.error.message);
        setStatus('idle');
        return;
      }
    }
    setStatus('saved');
  };

  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<'idle' | 'saving'>('idle');
  const [pwNotice, setPwNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pw.next.length < 8) return setPwNotice({ tone: 'error', text: 'Use at least 8 characters.' });
    if (pw.next !== pw.confirm) return setPwNotice({ tone: 'error', text: 'The two passwords do not match.' });
    setPwStatus('saving');
    const { error: pwError } = await supabase.auth.updateUser({ password: pw.next });
    setPwStatus('idle');
    if (pwError) return setPwNotice({ tone: 'error', text: pwError.message });
    setPw({ next: '', confirm: '' });
    setPwNotice({ tone: 'success', text: 'Password updated.' });
  };

  const update = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setStatus('idle');
  };

  return (
    <LearnerLayout active="profile" onNavigate={onNavigate}>
      <PageContainer>
        <p className="flex items-center gap-2 font-label text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Account and security
        </p>
        <PageTitle className="mt-4">Profile settings</PageTitle>
        <p className="mt-3 max-w-[640px] text-[17px] leading-[1.6] text-[var(--pg-body)]">Keep your details current and your account secure.</p>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
          <form onSubmit={save} className={`${CARD} grid gap-5 p-7 sm:grid-cols-2`}>
            <div className="flex items-start justify-between sm:col-span-2">
              <div>
                <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your details</p>
                <h2 className="mt-1 text-[24px] font-bold tracking-[-0.01em]">Personal information</h2>
              </div>
              <UserRound className="h-5 w-5 text-[var(--pg-accent)]" aria-hidden="true" />
            </div>
            <PhotoField userId={user?.id} name={`${values.first_name} ${values.last_name}`.trim() || user?.email || ""} className="sm:col-span-2" />
            <Field label="First name">
              <TextInput value={values.first_name} onChange={update('first_name')} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <TextInput value={values.last_name} onChange={update('last_name')} autoComplete="family-name" />
            </Field>
            <Field label="WhatsApp number" hint="Used for your midweek nudge">
              <TextInput value={values.phone} onChange={update('phone')} autoComplete="tel" inputMode="tel" />
            </Field>

            {detailsReady && (
              <>
                <Field label="Mobile number" hint="If different from WhatsApp">
                  <TextInput value={values.mobile} onChange={update('mobile')} autoComplete="tel-national" inputMode="tel" />
                </Field>
                <Field label="Country">
                  <Select value={values.country} onChange={update('country')} autoComplete="country-name">
                    <option value="">Choose your country</option>
                    {COUNTRIES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="City or state">
                  <TextInput value={values.city} onChange={update('city')} autoComplete="address-level2" />
                </Field>
                <Field label="Business name">
                  <TextInput value={values.business_name} onChange={update('business_name')} autoComplete="organization" />
                </Field>
                <Field label="Website or social link">
                  <TextInput value={values.website} onChange={update('website')} autoComplete="url" inputMode="url" placeholder="https://" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="About you" hint={`${values.bio.length} of ${BIO_LIMIT} characters`}>
                    <TextArea
                      value={values.bio}
                      onChange={update('bio')}
                      rows={4}
                      maxLength={BIO_LIMIT}
                      placeholder="What you do, who you serve, and what you want from the Academy."
                    />
                  </Field>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" variant="dark" busy={status === 'saving'}>
                {status === 'saved' ? 'Saved' : 'Save details'}
              </Button>
            </div>
            {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
          </form>

          <form onSubmit={changePassword} className={`${CARD} space-y-5 p-7`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Sign-in security</p>
                <h2 className="mt-1 text-[24px] font-bold tracking-[-0.01em]">Change password</h2>
              </div>
              <KeyRound className="h-5 w-5 text-[var(--pg-accent)]" aria-hidden="true" />
            </div>
            <p className="text-[15px] leading-[1.55] text-[var(--pg-body)]">Choose a password you do not use elsewhere. Google accounts can keep signing in with Google unless they add a password here.</p>
            {pwNotice && <Notice tone={pwNotice.tone}>{pwNotice.text}</Notice>}
            <Field label="New password">
              <TextInput type="password" autoComplete="new-password" value={pw.next} onChange={(e) => { setPw({ ...pw, next: e.target.value }); setPwNotice(null); }} placeholder="At least 8 characters" />
            </Field>
            <Field label="Confirm new password">
              <TextInput type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => { setPw({ ...pw, confirm: e.target.value }); setPwNotice(null); }} placeholder="Repeat your new password" />
            </Field>
            <Button type="submit" variant="dark" busy={pwStatus === 'saving'}>Update password</Button>
          </form>
        </div>
      </PageContainer>
    </LearnerLayout>
  );
}

/** Profile photo: shows the current one and lets the member choose a new image or remove it. */
function PhotoField({ userId, name, className = '' }: { userId: string | undefined; name: string; className?: string }) {
  const photo = useMyAvatar(userId);
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await uploadAvatar(userId, file);
      setMessage({ tone: 'success', text: 'Photo updated.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'We could not upload that photo.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await removeAvatar(userId);
      setMessage({ tone: 'success', text: 'Photo removed.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'We could not remove that photo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-5 border-b border-[var(--pg-line-soft)] pb-5 ${className}`}>
      <Avatar url={photo} name={name} size={72} />
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold">Profile photo</p>
        <p className="mt-0.5 text-[13px] text-[var(--pg-body)]">JPG, PNG or WebP, up to 5MB.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void choose(event)} aria-label="Choose a profile photo" />
          <Button type="button" variant="ghost" busy={busy} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" /> {photo ? 'Change photo' : 'Choose image'}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {message && <p role="status" className={`mt-2 text-[13px] ${message.tone === 'error' ? 'text-[#B42318]' : 'text-[var(--pg-body)]'}`}>{message.text}</p>}
      </div>
    </div>
  );
}
