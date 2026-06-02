-- Cleanup: drop the broken settle_session overload (varchar signature, wrong column names, wrong threshold)
DROP FUNCTION IF EXISTS settle_session(VARCHAR, INT, INT, INT);
DROP FUNCTION IF EXISTS settle_session(VARCHAR, INT, INT, INT, INT);
