-- Dữ liệu Warehouse cho demo TransportRequest (Development only).
-- Warehouse chưa có API tạo Warehouse/Product, nên seed thẳng vào schema "warehouse".
-- Id giống samples/job-runtime-demo/assumed-fixtures/05-assumed-transport-request.payload.json.
-- Chạy lại nhiều lần được: xoá request demo cũ rồi upsert lại dữ liệu.

BEGIN;

-- Xoá Job runtime cũ của các container demo (cascade sang job_containers / job_tasks / job_steps).
DELETE FROM execution.jobs
WHERE id IN (
    SELECT job_id
    FROM execution.job_containers
    WHERE container_id IN (
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000002',
        'c3000000-0000-4000-8000-000000000003',
        'c6000000-0000-4000-8000-000000000006',
        'c7000000-0000-4000-8000-000000000007',
        'c8000000-0000-4000-8000-000000000008'));

-- Xoá TransportRequest cũ có chứa container demo, để chạy lại không bị 409 container_already_requested.
DELETE FROM transportation.transport_requests
WHERE id IN (
    SELECT transport_request_id
    FROM transportation.transport_request_details
    WHERE container_id IN (
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000002',
        'c3000000-0000-4000-8000-000000000003',
        'c4000000-0000-4000-8000-000000000004',
        'c5000000-0000-4000-8000-000000000005',
        'c6000000-0000-4000-8000-000000000006',
        'c7000000-0000-4000-8000-000000000007',
        'c8000000-0000-4000-8000-000000000008'));

INSERT INTO warehouse.warehouses (id, code, name, address, timezone, is_active, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'WH-DEMO', 'Kho demo TransportRequest', 'FPT HCM', 'Asia/Ho_Chi_Minh', TRUE, now())
ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

INSERT INTO warehouse.product_categories (id, code, name, description)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'CAT-DEMO', 'Hàng demo', 'Danh mục cho demo TransportRequest')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouse.products (id, category_id, sku, supplier_barcode, name, description, is_active, created_at, updated_at)
VALUES ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
        'SKU-DEMO-000001', NULL, 'Thùng linh kiện demo', NULL, TRUE, now(), now())
ON CONFLICT (id) DO NOTHING;

-- C1..C3: STORED (hợp lệ để vận chuyển). C4: RESERVED (dùng cho ca lỗi container_not_eligible).
-- C5: STORED, không dùng ở request chính (dùng cho ca lỗi workflow_not_found).
-- C6..C8: STORED, dùng cho request thứ hai (C6 A->D, C7 B->E, C8 C->F).
INSERT INTO warehouse.containers (id, product_id, barcode, supplier_package_barcode, status,
                                  current_storage_location_id, current_level_no, created_by, created_at, updated_at)
VALUES
    ('c1000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000001', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c2000000-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000002', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c3000000-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000003', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c4000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000004', NULL, 'RESERVED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c5000000-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000005', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c6000000-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000006', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c7000000-0000-4000-8000-000000000007', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000007', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now()),
    ('c8000000-0000-4000-8000-000000000008', 'dddddddd-0000-4000-8000-000000000001', 'CTN-DEMO-000008', NULL, 'STORED', NULL, NULL, 'a0000000-0000-4000-8000-000000000001', now(), now())
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now();

COMMIT;
