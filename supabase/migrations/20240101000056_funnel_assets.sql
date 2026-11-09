-- Images a member uploads in the page editor. Safe to re-run.
--
-- A public bucket (the images are shown on the funnel's public page). A signed-in member can add, replace and delete
-- files only inside the folder named after their own funnel (the build job id), which the policies check against the
-- funnels they own. Images only: JPEG, PNG, WebP and GIF, up to 5 MB. SVG is left out on purpose, because an SVG can
-- carry script. The bucket name is prefixed because this Supabase project is shared with other sites.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('breadmaker-funnel-assets', 'breadmaker-funnel-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Does the signed-in member own the funnel whose id is the first part of the file path?
create or replace function breadmaker.owns_funnel_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = breadmaker, public
as $$
  select exists (
    select 1
    from breadmaker.build_jobs j
    join breadmaker.applications a on a.id = j.application_id
    where j.id::text = folder and a.user_id = auth.uid()
  );
$$;

grant execute on function breadmaker.owns_funnel_folder(text) to authenticated;

drop policy if exists "Breadmaker funnel assets: members add to their funnel" on storage.objects;
create policy "Breadmaker funnel assets: members add to their funnel" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'breadmaker-funnel-assets' and breadmaker.owns_funnel_folder((storage.foldername(name))[1]));

drop policy if exists "Breadmaker funnel assets: members replace in their funnel" on storage.objects;
create policy "Breadmaker funnel assets: members replace in their funnel" on storage.objects
  for update to authenticated
  using (bucket_id = 'breadmaker-funnel-assets' and breadmaker.owns_funnel_folder((storage.foldername(name))[1]));

drop policy if exists "Breadmaker funnel assets: members delete from their funnel" on storage.objects;
create policy "Breadmaker funnel assets: members delete from their funnel" on storage.objects
  for delete to authenticated
  using (bucket_id = 'breadmaker-funnel-assets' and breadmaker.owns_funnel_folder((storage.foldername(name))[1]));
