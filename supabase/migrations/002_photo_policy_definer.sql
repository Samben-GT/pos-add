-- the storage policy runs as the browser's role, which cannot read the tables; check through a definer function
create or replace function public.photo_slot_ok(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
     where s.store = split_part(p_path, '/', 1)
       and s.id::text = split_part(p_path, '/', 2)
       and s.status = 'uploading'
       and split_part(p_path, '/', 3) ~ '^[1-4]\.jpg$'
       and split_part(p_path, '/', 4) = ''
  );
$$;
revoke all on function public.photo_slot_ok from public;
grant execute on function public.photo_slot_ok to anon, authenticated;

drop policy "shop link adds product photos" on storage.objects;
create policy "shop link adds product photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'photos' and public.photo_slot_ok(name));
