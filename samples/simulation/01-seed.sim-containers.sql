-- Container cho demo GĐ 3 trong kho WH-SIM (Development only). Chạy lại được:
-- xoá Job runtime + TransportRequest cũ của các container này, rồi đặt lại trạng thái STORED.
BEGIN;

DELETE FROM execution.jobs
WHERE id IN (SELECT job_id FROM execution.job_containers
             WHERE container_id IN ('e1000000-0000-4000-8000-000000000001',
                                    'e2000000-0000-4000-8000-000000000002',
                                    'e3000000-0000-4000-8000-000000000003',
                                    'e4000000-0000-4000-8000-000000000004',
                                    'e5000000-0000-4000-8000-000000000005',
                                    'e6000000-0000-4000-8000-000000000006',
                                    'e7000000-0000-4000-8000-000000000007',
                                    'e8000000-0000-4000-8000-000000000008',
                                    'e9000000-0000-4000-8000-000000000009',
                                    'ea000000-0000-4000-8000-000000000010',
                                    'eb000000-0000-4000-8000-000000000011'));

DELETE FROM transportation.transport_requests
WHERE id IN (SELECT transport_request_id FROM transportation.transport_request_details
             WHERE container_id IN ('e1000000-0000-4000-8000-000000000001',
                                    'e2000000-0000-4000-8000-000000000002',
                                    'e3000000-0000-4000-8000-000000000003',
                                    'e4000000-0000-4000-8000-000000000004',
                                    'e5000000-0000-4000-8000-000000000005',
                                    'e6000000-0000-4000-8000-000000000006',
                                    'e7000000-0000-4000-8000-000000000007',
                                    'e8000000-0000-4000-8000-000000000008',
                                    'e9000000-0000-4000-8000-000000000009',
                                    'ea000000-0000-4000-8000-000000000010',
                                    'eb000000-0000-4000-8000-000000000011'));

INSERT INTO warehouse.product_categories (id, code, name, description)
VALUES ('cccccccc-0000-4000-8000-0000000000a1', 'CAT-SIM', 'Simulation goods', 'Category for the Gazebo demo')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO warehouse.products (id, category_id, sku, supplier_barcode, name, description, is_active, created_at, updated_at)
VALUES ('dddddddd-0000-4000-8000-0000000000a1', 'cccccccc-0000-4000-8000-0000000000a1',
        'SKU-SIM-000001', NULL, 'Simulation carton', NULL, TRUE, now(), now())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO warehouse.containers (id, product_id, barcode, supplier_package_barcode, status,
                                  current_storage_location_id, current_level_no, created_by, created_at, updated_at)
VALUES
    ('e1000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-SIM-000001', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e2000000-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-SIM-000002', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e3000000-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-SIM-000003', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET status = 'STORED', updated_at = now();

-- Inbound demo: containers just received at the inbound dock (PACKED), to be put away on the racks.
INSERT INTO warehouse.containers (id, product_id, barcode, supplier_package_barcode, status,
                                  current_storage_location_id, current_level_no, created_by, created_at, updated_at)
VALUES
    ('e4000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-IN-000001', NULL, 'PACKED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e5000000-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-IN-000002', NULL, 'PACKED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e6000000-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-IN-000003', NULL, 'PACKED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET status = 'PACKED', updated_at = now();

-- Rack-to-rack relocation demo: containers already stored on the racks (storage locations from seed-sim.ps1:
-- demo map v6: LOC-SIM-S01..S04 = f0..01..04). Re-running puts them back on their starting shelf.
INSERT INTO warehouse.containers (id, product_id, barcode, supplier_package_barcode, status,
                                  current_storage_location_id, current_level_no, created_by, created_at, updated_at)
VALUES
    ('e7000000-0000-4000-8000-000000000007', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-RL-000001', NULL, 'STORED', 'f0000000-0000-4000-8000-000000000001', NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e8000000-0000-4000-8000-000000000008', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-RL-000002', NULL, 'STORED', 'f0000000-0000-4000-8000-000000000001', NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('e9000000-0000-4000-8000-000000000009', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-RL-000003', NULL, 'STORED', 'f0000000-0000-4000-8000-000000000002', NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('ea000000-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-RL-000004', NULL, 'STORED', 'f0000000-0000-4000-8000-000000000003', NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('eb000000-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-0000000000a1', 'CTN-RL-000005', NULL, 'STORED', 'f0000000-0000-4000-8000-000000000004', NULL, 'a0000000-0000-4000-8000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET status = 'STORED', current_storage_location_id = EXCLUDED.current_storage_location_id,
                               current_level_no = NULL, updated_at = now();

COMMIT;
