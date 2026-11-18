using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAtomicInboundVoucherPosting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "stock_posted_at",
                schema: "warehouse",
                table: "stock_vouchers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<short>(
                name: "inventory_level_no",
                schema: "warehouse",
                table: "containers",
                type: "smallint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "inventory_storage_location_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers",
                sql: "stock_posted_at IS NULL OR (type = 'INBOUND' AND status = 'CONFIRMED')");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                column: "creation_stock_voucher_id");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                column: "inbound_stock_voucher_id");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_inventory_storage_location_id",
                schema: "warehouse",
                table: "containers",
                column: "inventory_storage_location_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(inbound_stock_voucher_id IS NULL AND inventory_storage_location_id IS NULL AND inventory_level_no IS NULL) OR (inbound_stock_voucher_id IS NOT NULL AND inventory_storage_location_id IS NOT NULL AND inventory_level_no IS NOT NULL AND inventory_level_no > 0)");

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_stock_vouchers_creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                column: "creation_stock_voucher_id",
                principalSchema: "warehouse",
                principalTable: "stock_vouchers",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_stock_vouchers_inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers",
                column: "inbound_stock_voucher_id",
                principalSchema: "warehouse",
                principalTable: "stock_vouchers",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_storage_locations_inventory_storage_location_id",
                schema: "warehouse",
                table: "containers",
                column: "inventory_storage_location_id",
                principalSchema: "warehouse",
                principalTable: "storage_locations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "f_k_containers_stock_vouchers_creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropForeignKey(
                name: "f_k_containers_stock_vouchers_inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropForeignKey(
                name: "f_k_containers_storage_locations_inventory_storage_location_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropIndex(
                name: "i_x_containers_creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropIndex(
                name: "i_x_containers_inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropIndex(
                name: "i_x_containers_inventory_storage_location_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_stock_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "stock_posted_at",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropColumn(
                name: "creation_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "inbound_stock_voucher_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "inventory_level_no",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "inventory_storage_location_id",
                schema: "warehouse",
                table: "containers");
        }
    }
}
