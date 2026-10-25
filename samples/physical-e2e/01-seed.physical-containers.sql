-- One PACKED container for physical INBOUND put-away E2E (Development only). Re-runnable.
BEGIN;

DELETE FROM execution.jobs
WHERE id IN (SELECT job_id FROM execution.job_containers
             WHERE container_id = 'e7000000-0000-4000-8000-000000000007');

DELETE FROM transportation.transport_requests
WHERE id IN (SELECT transport_request_id FROM transportation.transport_request_details
             WHERE container_id = 'e7000000-0000-4000-8000-000000000007');

INSERT INTO warehouse.product_categories (id, code, name, description)
VALUES ('cccccccc-0000-4000-8000-0000000000b1', 'CAT-REAL', 'Physical E2E goods', 'Category for physical robot E2E')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO warehouse.products (id, category_id, sku, supplier_barcode, name, description, is_active, created_at, updated_at)
VALUES ('dddddddd-0000-4000-8000-0000000000b1', 'cccccccc-0000-4000-8000-0000000000b1',
        'SKU-REAL-000001', NULL, 'Physical E2E carton', NULL, TRUE, now(), now())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO warehouse.containers (id, product_id, barcode, supplier_package_barcode, status,
                                  current_storage_location_id, current_level_no, created_by, created_at, updated_at)
VALUES
    ('e7000000-0000-4000-8000-000000000007', 'dddddddd-0000-4000-8000-0000000000b1', 'CTN-REAL-000001', NULL, 'PACKED',
     NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET status = 'PACKED', current_storage_location_id = NULL, updated_at = now();

COMMIT;
