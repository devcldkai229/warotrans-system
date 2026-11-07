using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotBatteryEstimate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "battery_percent",
                schema: "fleet",
                table: "robots",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(5,2)",
                oldPrecision: 5,
                oldScale: 2);

            migrationBuilder.AddColumn<string>(
                name: "battery_charging_state",
                schema: "fleet",
                table: "robots",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "battery_confidence",
                schema: "fleet",
                table: "robots",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "battery_estimation_mode",
                schema: "fleet",
                table: "robots",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "battery_updated_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "battery_voltage",
                schema: "fleet",
                table: "robots",
                type: "numeric(6,3)",
                precision: 6,
                scale: 3,
                nullable: true);

            // The old non-null column defaulted to 0 % for robots without a battery sensor (null telemetry was
            // ignored). Battery is a runtime snapshot: reset to UNKNOWN, the next telemetry fills it in again.
            migrationBuilder.Sql(
                "UPDATE fleet.robots SET battery_percent = NULL, battery_estimation_mode = 'UNAVAILABLE', "
                + "battery_confidence = 'NONE', battery_charging_state = 'UNKNOWN';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE fleet.robots SET battery_percent = 0 WHERE battery_percent IS NULL;");

            migrationBuilder.DropColumn(
                name: "battery_charging_state",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_confidence",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_estimation_mode",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_updated_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_voltage",
                schema: "fleet",
                table: "robots");

            migrationBuilder.AlterColumn<decimal>(
                name: "battery_percent",
                schema: "fleet",
                table: "robots",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m,
                oldClrType: typeof(decimal),
                oldType: "numeric(5,2)",
                oldPrecision: 5,
                oldScale: 2,
                oldNullable: true);
        }
    }
}
