-- Enable Supabase Realtime for wallet and transactions tables
-- so the React user app receives live balance and transaction status updates.

ALTER TABLE wallet      REPLICA IDENTITY FULL;
ALTER TABLE transactions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE wallet;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
