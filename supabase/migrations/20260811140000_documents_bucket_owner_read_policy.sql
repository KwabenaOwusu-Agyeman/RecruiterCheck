-- HIGH FIX: defense-in-depth RLS on the `documents` storage bucket.
--
-- storage.objects policies only ever matched bucket_id = 'cvs' (see
-- initial_schema.sql). No policy exists for bucket_id = 'documents', so
-- RLS-enabled-no-matching-policy currently denies all direct anon/
-- authenticated access — the only access path today is generate-documents'
-- short-lived (300s) signed URLs, created via the service-role client,
-- which bypasses RLS entirely and derives the storage path from the
-- caller's own verified user.id.
--
-- That's safe today, but it means RLS provides zero backstop if that
-- Edge Function's path-construction logic ever regresses. Add an explicit
-- owner-scoped SELECT policy, matching the existing `cvs` bucket pattern
-- (generate-documents writes to `${user.id}/${checkId}/...`, so
-- (storage.foldername(name))[1] is the owning user's id). SELECT only,
-- deliberately: there is no legitimate client-side write path into this
-- bucket (uploads happen only via the service-role client), so adding
-- INSERT/UPDATE/DELETE policies would open new surface rather than close
-- one.
create policy "Users can read own generated documents"
on storage.objects for select
using (
  bucket_id = 'documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);
