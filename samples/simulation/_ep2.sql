SELECT e.code, e.name, e.endpoint_type, e.x, e.y, e.yaw, e.id::text
FROM navigation.endpoints e
JOIN navigation.map_versions v ON e.map_version_id = v.id
WHERE v.code = 'MAP-WHSIM-V018'
ORDER BY e.code;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'warehouse' AND table_name = 'storage_locations'
ORDER BY ordinal_position;

SELECT *
FROM warehouse.storage_locations
WHERE warehouse_id = '33333333-3333-3333-3333-333333333333';
