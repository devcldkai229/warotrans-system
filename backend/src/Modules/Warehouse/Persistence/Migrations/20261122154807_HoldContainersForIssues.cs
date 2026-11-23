using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class HoldContainersForIssues : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "held_at",
                schema: "warehouse",
                table: "containers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "hold_endpoint_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "hold_issue_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "hold_reason_code",
                schema: "warehouse",
                table: "containers",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_containers_hold_issue_id",
                schema: "warehouse",
                table: "containers",
                column: "hold_issue_id",
                filter: "hold_issue_id IS NOT NULL");

            // Every container HOLD so far was set down where no shelf is (no problem holds existed yet).
            migrationBuilder.Sql(
                "UPDATE warehouse.containers SET hold_reason_code = 'OFF_SHELF', held_at = updated_at WHERE status = 'HOLD' AND hold_reason_code IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_containers_hold_issue_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "held_at",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "hold_endpoint_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "hold_issue_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "hold_reason_code",
                schema: "warehouse",
                table: "containers");
        }
    }
}
