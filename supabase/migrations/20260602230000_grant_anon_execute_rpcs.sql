-- Grant EXECUTE on client-facing RPCs to anon role
-- These functions have internal x-user-token verification,
-- so even anon can only act on behalf of their own session.

GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon;
