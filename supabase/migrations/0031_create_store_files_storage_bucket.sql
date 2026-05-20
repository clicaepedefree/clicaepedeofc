insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-files',
  'store-files',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
