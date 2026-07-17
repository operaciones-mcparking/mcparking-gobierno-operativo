-- Persist safe aggregate import results for /recuperacion batches.
-- These columns intentionally store only counts and amounts; no raw CSV content,
-- identifiers, emails, phones, bform, cms_url, or payloads are stored here.

alter table public.recovery_import_batches
  add column if not exists inserted_rows integer,
  add column if not exists skipped_duplicate_rows integer,
  add column if not exists conflict_rows integer,
  add column if not exists invalid_rows integer,
  add column if not exists inserted_amount numeric(14,2),
  add column if not exists source_duplicate_rows integer,
  add column if not exists booking_duplicate_rows integer,
  add column if not exists message_duplicate_rows integer,
  add column if not exists inserted_abandoned_rows integer,
  add column if not exists inserted_canceled_rows integer,
  add column if not exists message_sent_rows integer;

alter table public.recovery_import_batches
  drop constraint if exists recovery_import_batches_import_result_numbers_check;

alter table public.recovery_import_batches
  add constraint recovery_import_batches_import_result_numbers_check
  check (
    (inserted_rows is null or inserted_rows >= 0)
    and (skipped_duplicate_rows is null or skipped_duplicate_rows >= 0)
    and (conflict_rows is null or conflict_rows >= 0)
    and (invalid_rows is null or invalid_rows >= 0)
    and (inserted_amount is null or inserted_amount >= 0)
    and (source_duplicate_rows is null or source_duplicate_rows >= 0)
    and (booking_duplicate_rows is null or booking_duplicate_rows >= 0)
    and (message_duplicate_rows is null or message_duplicate_rows >= 0)
    and (inserted_abandoned_rows is null or inserted_abandoned_rows >= 0)
    and (inserted_canceled_rows is null or inserted_canceled_rows >= 0)
    and (message_sent_rows is null or message_sent_rows >= 0)
  );

comment on column public.recovery_import_batches.inserted_rows is
  'Number of rows inserted by the import RPC. Null means the result was not persisted for this historical batch.';

comment on column public.recovery_import_batches.skipped_duplicate_rows is
  'Number of duplicate rows skipped by the import RPC. Stores aggregate counts only.';

comment on column public.recovery_import_batches.conflict_rows is
  'Number of rows skipped as conflicts by the import RPC. Stores aggregate counts only.';

comment on column public.recovery_import_batches.invalid_rows is
  'Number of rows considered invalid by the import RPC. Stores aggregate counts only.';

comment on column public.recovery_import_batches.inserted_amount is
  'Total amount inserted for valid purchase rows by the purchases import RPC.';

comment on column public.recovery_import_batches.source_duplicate_rows is
  'Incomplete bookings import aggregate: rows skipped because source_id was already imported.';

comment on column public.recovery_import_batches.booking_duplicate_rows is
  'Incomplete bookings import aggregate: rows skipped because booking_id was already imported.';

comment on column public.recovery_import_batches.message_duplicate_rows is
  'Incomplete bookings import aggregate: rows skipped because message_id was already imported.';

comment on column public.recovery_import_batches.inserted_abandoned_rows is
  'Incomplete bookings import aggregate: inserted abandoned cart rows.';

comment on column public.recovery_import_batches.inserted_canceled_rows is
  'Incomplete bookings import aggregate: inserted canceled cart rows.';

comment on column public.recovery_import_batches.message_sent_rows is
  'Incomplete bookings import aggregate: inserted rows with message_sent true.';
