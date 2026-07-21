update storage.buckets
set allowed_mime_types = array(
  select distinct mime_type
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array[
      'image/gif',
      'image/heic',
      'image/heic-sequence',
      'image/heif',
      'image/heif-sequence',
      'image/webp'
    ]::text[]
  ) as supported(mime_type)
  order by mime_type
)
where id = 'wafer-process-files';
