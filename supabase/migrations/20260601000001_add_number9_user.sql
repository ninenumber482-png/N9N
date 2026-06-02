CREATE TABLE IF NOT EXISTS n9_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO n9_users (username, email, password_hash, full_name, role, is_active)
VALUES ('number9', 'number9@number9.local', '362745', 'Number9', 'admin', true)
ON CONFLICT (username) DO NOTHING;
