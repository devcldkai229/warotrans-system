using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVoucherCompletionAndDirectIssue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "closed_short_at",
                schema: "warehouse",
                table: "stock_vouchers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "closed_short_by",
                schema: "warehouse",
                table: "stock_vouchers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "closed_short_reason",
                schema: "warehouse",
                table: "stock_vouchers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "completed_at",
                schema: "warehouse",
                table: "stock_vouchers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "closed_short_at",
                schema: "warehouse",
                table: "stock_voucher_lines",
                type: "timestamp with time zone",
                nullable: true);

            // STAGED_OUTBOUND is gone: a box still waiting at an Outbound gate keeps its stock and waits for people
            // (HOLD, recover it or put it on a phiếu xuất and ship it again).
            migrationBuilder.Sql("""
                UPDATE warehouse.containers
                   SET status = 'HOLD', current_endpoint_id = NULL, updated_at = now()
                 WHERE status = 'STAGED_OUTBOUND' OR current_endpoint_id IS NOT NULL;
                """);

            // A confirmed voucher whose Containers are all done already is COMPLETED.
            migrationBuilder.Sql("""
                UPDATE warehouse.stock_vouchers v
                   SET status = 'COMPLETED', completed_at = v.updated_at
                 WHERE v.status = 'CONFIRMED'
                   AND EXISTS (SELECT 1 FROM warehouse.stock_voucher_lines l WHERE l.stock_voucher_id = v.id)
                   AND NOT EXISTS (
                       SELECT 1
                         FROM warehouse.stock_voucher_lines l
                         JOIN warehouse.containers c ON c.id = l.container_id
                        WHERE l.stock_voucher_id = v.id
                          AND NOT (c.status = 'ISSUED' OR (v.type = 'INBOUND' AND c.status = 'STORED')));
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers",
                sql: "stock_posted_at IS NULL OR status IN ('CONFIRMED', 'COMPLETED')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers",
                sql: "current_endpoint_id IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "closed_short_at",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropColumn(
                name: "closed_short_by",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropColumn(
                name: "closed_short_reason",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropColumn(
                name: "completed_at",
                schema: "warehouse",
                table: "stock_vouchers");

            migrationBuilder.DropColumn(
                name: "closed_short_at",
                schema: "warehouse",
                table: "stock_voucher_lines");

            migrationBuilder.AddCheckConstraint(
                name: "ck_stock_vouchers_posted",
                schema: "warehouse",
                table: "stock_vouchers",
                sql: "stock_posted_at IS NULL OR status = 'CONFIRMED'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_endpoint_custody",
                schema: "warehouse",
                table: "containers",
                sql: "(current_endpoint_id IS NULL AND status <> 'STAGED_OUTBOUND') OR (current_endpoint_id IS NOT NULL AND status = 'STAGED_OUTBOUND' AND warehouse_id IS NOT NULL AND current_storage_location_id IS NULL AND current_level_no IS NULL AND inventory_storage_location_id IS NOT NULL)");
        }
    }
}
