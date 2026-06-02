-- Hash plaintext passwords in n9_users table using pgcrypto
-- The initial migration stored the password as literal text; this converts to bcrypt hash

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE n9_users
SET password_hash = crypt('362745', gen_salt('bf'))
WHERE password_hash = '362745';

