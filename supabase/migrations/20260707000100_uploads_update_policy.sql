-- ============================================================================
-- uploads bucket: allow members to overwrite their own files
-- ----------------------------------------------------------------------------
--  Members could INSERT into their own folder but not overwrite (upsert on an
--  existing path needs UPDATE). Required for resubmitting a corrected bank
--  transfer receipt after a rejection — same fix dues-receipts got in
--  20260702120000.
-- ============================================================================

drop policy if exists "Users can update own uploads" on storage.objects;
create policy "Users can update own uploads"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
