-- Brief 21, part H (2): a business's data, exported on request (the Data
-- Protection Act's right to a copy). Admin -> Businesses -> "Export data"
-- writes one JSON file here and hands the founder a signed link that works
-- for 24 hours; the file itself is removed by the daily job after 7 days.
--
-- Private: no public read, no storage.objects policy for any browser role,
-- so only the server's service role can write, read or remove a file, and
-- the only way to a file is the signed link. 50 MB a file.
--
-- Guarded like 202610170001: the local CI stack runs with storage off.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('exports', 'exports', false, 52428800, array['application/json'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
