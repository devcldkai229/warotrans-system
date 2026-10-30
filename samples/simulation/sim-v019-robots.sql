-- Point the WH-SIM robots at MAP-WHSIM-V019 (published 2026-10-28: endpoints moved off walls / onto lanes,
-- see docs/traffic-hardening/GRAPH_GEOMETRY_VALIDATION.md). Fleet has no API to change a robot's map.
UPDATE fleet.robots SET
  current_map_version_id = 'd676f366-6f08-417d-921f-ac89e0b18626',
  map_version_code = 'MAP-WHSIM-V019',
  updated_at = now()
WHERE code IN ('RBT-SIM-01', 'RBT-SIM-02');
