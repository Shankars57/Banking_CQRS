INSERT INTO account_summaries (
  account_id,
  owner_name,
  balance,
  currency,
  status,
  version
) VALUES (
  'acc-001',
  'Shankar',
  1250.0000,
  'INR',
  'OPEN',
  2
)
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO transaction_history (
  transaction_id,
  account_id,
  type,
  amount,
  description,
  timestamp
) VALUES
  (
    'txn-001',
    'acc-001',
    'ACCOUNT_CREATED',
    1000.0000,
    'Initial deposit when account was created',
    '2026-03-15T09:00:00Z'
  ),
  (
    'txn-002',
    'acc-001',
    'DEPOSIT',
    250.0000,
    'Cash deposit',
    '2026-03-15T09:30:00Z'
  )
ON CONFLICT (transaction_id) DO NOTHING;

INSERT INTO events (
  event_id,
  aggregate_id,
  aggregate_type,
  event_type,
  event_data,
  event_number,
  version,
  timestamp
) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'acc-001',
    'BankAccount',
    'AccountCreated',
    '{"owner_name":"Shankar","currency":"INR","balance":1000.0000,"status":"OPEN"}',
    1,
    1,
    '2026-03-15T09:00:00Z'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'acc-001',
    'BankAccount',
    'MoneyDeposited',
    '{"amount":250.0000,"description":"Cash deposit","balance":1250.0000}',
    2,
    2,
    '2026-03-15T09:30:00Z'
  )
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO snapshots (
  snapshot_id,
  aggregate_id,
  snapshot_data,
  last_event_number,
  created_at
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  'acc-001',
  '{"owner_name":"Shankar","currency":"INR","balance":1250.0000,"status":"OPEN","version":2}',
  2,
  '2026-03-15T09:30:00'
)
ON CONFLICT (aggregate_id) DO NOTHING;
