using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGateStagingAndUnlocatedReceiving : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.AddColumn<Guid>(
                name: "current_endpoint_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "warehouse_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "from_endpoint_id",
                schema: "warehouse",
                table: "container_movements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "to_endpoint_id",
                schema: "warehouse",
                table: "container_movements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers",
                sql: "stock_posted_at IS NULL OR status = 'CONFIRMED'");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_warehouse_id",
                schema: "warehouse",
                table: "containers",
                column: "warehouse_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers",
                sql: "(current_endpoint_id IS NULL AND status <> 'STAGED_OUTBOUND') OR (current_endpoint_id IS NOT NULL AND status = 'STAGED_OUTBOUND' AND warehouse_id IS NOT NULL AND current_storage_location_id IS NULL AND current_level_no IS NULL AND inventory_storage_location_id IS NOT NULL)");

            // Prior batch rows can be owned by the linked voucher or the previously assigned receiving location.
            // Preserve their physical location and accounting balance, including while a robot is carrying them.
            migrationBuilder.Sql("""
                UPDATE warehouse.containers c
                SET warehouse_id = COALESCE(
                    (SELECT v.warehouse_id FROM warehouse.stock_vouchers v WHERE v.id = c.inbound_stock_voucher_id),
                    (SELECT v.warehouse_id FROM warehouse.stock_vouchers v WHERE v.id = c.creation_stock_voucher_id),
                    (SELECT l.warehouse_id FROM warehouse.storage_locations l WHERE l.id = c.current_storage_location_id))
                WHERE c.inbound_stock_voucher_id IS NOT NULL OR c.creation_request_id IS NOT NULL;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(inventory_storage_location_id IS NULL AND inventory_level_no IS NULL) OR (inventory_storage_location_id IS NOT NULL AND inventory_level_no IS NOT NULL AND inventory_level_no > 0 AND warehouse_id IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_warehouses_warehouse_id",
                schema: "warehouse",
                table: "containers",
                column: "warehouse_id",
                principalSchema: "warehouse",
                principalTable: "warehouses",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "f_k_containers_warehouses_warehouse_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropIndex(
                name: "i_x_containers_warehouse_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "current_endpoint_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "warehouse_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "from_endpoint_id",
                schema: "warehouse",
                table: "container_movements");

            migrationBuilder.DropColumn(
                name: "to_endpoint_id",
                schema: "warehouse",
                table: "container_movements");

            migrationBuilder.AddCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers",
                sql: "stock_posted_at IS NULL OR (type = 'INBOUND' AND status = 'CONFIRMED')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(inbound_stock_voucher_id IS NULL AND inventory_storage_location_id IS NULL AND inventory_level_no IS NULL) OR (inbound_stock_voucher_id IS NOT NULL AND inventory_storage_location_id IS NOT NULL AND inventory_level_no IS NOT NULL AND inventory_level_no > 0)");
        }
    }
}
