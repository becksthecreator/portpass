-- Photos from a phone (brief 19, part E, 5 Oct 2026). A photo too big for
-- one request (the host caps a request at 4.5 MB; a phone photo is up to
-- 12 MB) is sent to PortPass's own server in pieces. The pieces wait here
-- until the last one arrives, are put back together, resized, and stored
-- in org-assets as a web-sized JPEG; then the pieces are deleted.
--
-- Private: no public read, and no storage.objects policy for any browser
-- role, so only the server's service role can write, read or remove a
-- piece. Each piece is at most 3 MB (the limit below leaves headroom).
--
-- org-assets also now takes what the server makes from a HEIC photo: still
-- only JPEG, PNG and WebP are ever stored there.
--
-- Guarded like 202609271007: the local CI stack runs with storage off,
-- where the storage schema may not exist, and this file must still apply.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('org-uploads', 'org-uploads', false, 4194304, null)
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
