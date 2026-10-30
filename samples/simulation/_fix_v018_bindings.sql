-- Point WH-SIM storage locations at MAP-WHSIM-V018 shelf endpoints.
UPDATE warehouse.storage_locations SET
  endpoint_id = '95d7b8b6-f5d7-4ac0-b83b-c04b621fc03d',
  code = 'LOC-SIM-S01',
  name = 'Rack S01',
  is_active = TRUE
WHERE id = 'f0000000-0000-4000-8000-000000000001';

UPDATE warehouse.storage_locations SET
  endpoint_id = 'f6e86006-61d2-46fb-96fd-52cc75a8267c',
  code = 'LOC-SIM-S02',
  name = 'Rack S02',
  is_active = TRUE
WHERE id = 'f0000000-0000-4000-8000-000000000002';

UPDATE warehouse.storage_locations SET
  endpoint_id = '22999183-9ff7-470e-8630-a096e89289fa',
  code = 'LOC-SIM-S03',
  name = 'Rack S03',
  is_active = TRUE
WHERE id = 'f0000000-0000-4000-8000-000000000003';

INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
VALUES (
  'f0000000-0000-4000-8000-000000000004',
  '33333333-3333-3333-3333-333333333333',
  '752a0bfe-8db3-4629-aa94-1509d42765e8',
  'LOC-SIM-S04',
  'Rack S04',
  TRUE,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  endpoint_id = EXCLUDED.endpoint_id,
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  is_active = TRUE;

UPDATE fleet.robots SET
  map_version_code = 'MAP-WHSIM-V018',
  current_map_version_id = '7cb001f7-cbf3-4f3e-8400-fddc00d63b19',
  updated_at = now()
WHERE code = 'RBT-SIM-01';
