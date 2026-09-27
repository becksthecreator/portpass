-- Storage bucket for business logos and photos. Public read (the URLs go
-- straight into <img src>), writes only through server routes on the
-- service role under org/{organization_id}/... -- so no storage.objects
-- policies are granted to the browser at all.
--
-- Guarded: the local CI stack runs with [storage] enabled = false, where
-- the storage schema may not exist, and this file must still apply there.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('org-assets', 'org-assets', true, 5242880, array['image/png','image/jpeg','image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
