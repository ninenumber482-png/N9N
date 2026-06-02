-- Fix number9 password_hash — it was stored as plaintext instead of bcrypt hash
-- The auth-login edge function uses bcrypt.compareSync() and fails against plaintext
UPDATE users
SET password_hash = '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua'
WHERE username = 'number9' AND password_hash !~ '^\$2[abxy]\$\d+\$';
