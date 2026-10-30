SELECT code, name, endpoint_type, x, y, yaw, id FROM navigation.endpoints e JOIN navigation.map_versions v ON e.map_version_id=v.id WHERE v.code='MAP-WHSIM-V018' ORDER BY e.code;
