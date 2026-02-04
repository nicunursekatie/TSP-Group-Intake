INSERT INTO users (email, name, role) 
VALUES 
  ('owner@tsp.org', 'Intake Owner', 'owner'),
  ('admin@tsp.org', 'Admin User', 'admin')
ON CONFLICT (email) DO NOTHING;
