using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RobotManualCharging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "charge_full_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "charge_reminder_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "charging_since",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "charge_full_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "charge_reminder_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "charging_since",
                schema: "fleet",
                table: "robots");
        }
    }
}
