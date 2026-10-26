-- Warehouse for physical robot E2E (Development only). Re-runnable.
INSERT INTO warehouse.warehouses (id, code, name, address, timezone, is_active, created_at)
VALUES ('44444444-4444-4444-4444-444444444444', 'WH-REAL', 'Physical Lab Warehouse',
        'warotrans_map2 physical floor', 'Asia/Ho_Chi_Minh', TRUE, now())
ON CONFLICT (id) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name, address = EXCLUDED.address;
