-- Profile photos. Safe to re-run.
--
-- Adds profiles.avatar_url and a public storage bucket for the photos. Each member can only write
-- inside their own folder (the first part of the file path is their user id). The bucket name is
-- prefixed because this Supabase project is shared with other sites.

alter table breadmaker.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('breadmaker-avatars', 'breadmaker-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Breadmaker avatars: members add their own" on storage.objects;
create policy "Breadmaker avatars: members add their own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'breadmaker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Breadmaker avatars: members replace their own" on storage.objects;
create policy "Breadmaker avatars: members replace their own" on storage.objects
  for update to authenticated
  using (bucket_id = 'breadmaker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Breadmaker avatars: members delete their own" on storage.objects;
create policy "Breadmaker avatars: members delete their own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'breadmaker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
