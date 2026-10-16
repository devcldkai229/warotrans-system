-- Warehouse cho mô phỏng Gazebo (Development only).
-- Chưa có API tạo Warehouse nên seed thẳng vào schema "warehouse". Chạy lại nhiều lần được.
INSERT INTO warehouse.warehouses (id, code, name, address, timezone, is_active, created_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'WH-SIM', 'Simulation Warehouse', 'Gazebo sim_warehouse 11 x 7.5 m',
        'Asia/Ho_Chi_Minh', TRUE, now())
ON CONFLICT (id) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name, address = EXCLUDED.address;
