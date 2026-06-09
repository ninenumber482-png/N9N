-- Backfill reference_code for transactions created before the auto-generate trigger was added.
-- Uses md5(id) so backfills are deterministic and idempotent.
UPDATE transactions
SET reference_code = CASE type
  WHEN 'DEPOSIT'    THEN 'DEP-'
  WHEN 'WITHDRAWAL' THEN 'WTH-'
  ELSE 'TXN-'
END || substr(upper(md5(id::text)), 1, 8)
WHERE reference_code IS NULL;
