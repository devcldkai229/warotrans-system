SELECT e.code, e.id
FROM navigation.endpoints e
JOIN navigation.map_versions v ON e.map_version_id = v.id
WHERE v.code = 'MAP-WHSIM-V018'
ORDER BY e.code;

SELECT e.code, e.id, e.direction, e.max_speed, e.width_meters
FROM navigation.edges e
JOIN navigation.map_versions v ON e.map_version_id = v.id
WHERE v.code = 'MAP-WHSIM-V018'
ORDER BY e.code;

SELECT z.code, z.zone_type
FROM navigation.zones z
JOIN navigation.map_versions v ON z.map_version_id = v.id
WHERE v.code = 'MAP-WHSIM-V018'
ORDER BY z.code;

SELECT id, code, is_online, status, map_version_code, current_map_version_id
FROM fleet.robots
ORDER BY code;
