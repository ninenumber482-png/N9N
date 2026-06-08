-- Grant execute permission for get_active_popup_banners to anon users
-- This allows the React login page to fetch active popup banners

GRANT EXECUTE ON FUNCTION get_active_popup_banners() TO anon, authenticated, service_role;
