-- Development only. Run on the intended WaroTrans DB after Warehouse migrations.
-- Creates one explicitly configured location on Kho ONE's existing published Inbound endpoint.
-- Does not create/rename/publish maps or endpoints and refuses ambiguous/wrong existing bindings.
BEGIN;
DO $$
DECLARE
    warehouse_uuid constant uuid := '55c88958-d994-48d3-ae5d-11991476673f';
    location_uuid constant uuid := '473896d8-f634-4807-9c89-e2c264a30eae';
    inbound_endpoint uuid;
    existing_location uuid;
    matches integer;
BEGIN
    SELECT count(*), (array_agg(e.id))[1] INTO matches, inbound_endpoint
    FROM navigation.endpoints e
    JOIN navigation.map_versions m ON m.id = e.map_version_id
    JOIN warehouse.warehouses w ON w.id = m.warehouse_id
    WHERE w.id = warehouse_uuid AND w.code IN ('WH-ONE', 'ONE') AND w.is_active
      AND m.status = 'PUBLISHED' AND e.code = 'EP-INBOUND'
      AND e.endpoint_type = 'WAYPOINT' AND e.is_enabled;
    IF matches <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one enabled EP-INBOUND on Kho ONE published map, found %', matches;
    END IF;
    SELECT id INTO existing_location FROM warehouse.storage_locations WHERE endpoint_id = inbound_endpoint;
    IF existing_location IS NOT NULL AND existing_location <> location_uuid THEN
        RAISE EXCEPTION 'Inbound already has location %. Set WarehouseReceiving config to that real ID instead.', existing_location;
    END IF;
    INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
    VALUES (location_uuid, warehouse_uuid, inbound_endpoint, 'INBOUND-ONE', 'Inbound Dock 01', true, now())
    ON CONFLICT (id) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM warehouse.storage_locations
        WHERE id = location_uuid AND warehouse_id = warehouse_uuid AND endpoint_id = inbound_endpoint AND is_active) THEN
        RAISE EXCEPTION 'Configured receiving location exists with a different or inactive binding';
    END IF;
END $$;
COMMIT;
