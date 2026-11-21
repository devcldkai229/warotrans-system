using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StoreStaffWorkZone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "work_zone_code",
                schema: "identity",
                table: "accounts",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "work_zone_warehouse_id",
                schema: "identity",
                table: "accounts",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "work_zone_code",
                schema: "identity",
                table: "accounts");

            migrationBuilder.DropColumn(
                name: "work_zone_warehouse_id",
                schema: "identity",
                table: "accounts");
        }
    }
}
