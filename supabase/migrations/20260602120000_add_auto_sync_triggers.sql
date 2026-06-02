-- Auto-sync users.kyc_status when kyc_documents.status changes
CREATE OR REPLACE FUNCTION sync_user_kyc_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    UPDATE users SET kyc_status = NEW.status WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_user_kyc_status ON kyc_documents;
CREATE TRIGGER trg_sync_user_kyc_status
AFTER UPDATE OF status ON kyc_documents
FOR EACH ROW EXECUTE FUNCTION sync_user_kyc_status();

-- Auto-generate short_code on user INSERT
CREATE OR REPLACE FUNCTION trg_set_user_short_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := 'U' || substr(upper(md5(NEW.id::text)), 1, 9);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_short_code ON users;
CREATE TRIGGER trg_user_short_code
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION trg_set_user_short_code();

-- Auto-generate reference_code on transactions INSERT
CREATE OR REPLACE FUNCTION trg_set_transaction_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_code IS NULL THEN
    NEW.reference_code := CASE NEW.type
      WHEN 'DEPOSIT' THEN 'DEP-'
      WHEN 'WITHDRAWAL' THEN 'WTH-'
      ELSE 'TXN-'
    END || substr(upper(md5(gen_random_uuid()::text)), 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_reference_code ON transactions;
CREATE TRIGGER trg_transaction_reference_code
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION trg_set_transaction_code();
