using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotRuntimeTelemetrySnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "angular_velocity",
                schema: "fleet",
                table: "robots",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "current_command_id",
                schema: "fleet",
                table: "robots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "error_code",
                schema: "fleet",
                table: "robots",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_online",
                schema: "fleet",
                table: "robots",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "last_heartbeat_boot_id",
                schema: "fleet",
                table: "robots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "last_heartbeat_sequence",
                schema: "fleet",
                table: "robots",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_telemetry_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "last_telemetry_boot_id",
                schema: "fleet",
                table: "robots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "last_telemetry_sequence",
                schema: "fleet",
                table: "robots",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "linear_velocity",
                schema: "fleet",
                table: "robots",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "localization_status",
                schema: "fleet",
                table: "robots",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "map_version_code",
                schema: "fleet",
                table: "robots",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "navigation_status",
                schema: "fleet",
                table: "robots",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_robots_is_online",
                schema: "fleet",
                table: "robots",
                column: "is_online");

            migrationBuilder.CreateIndex(
                name: "i_x_robots_last_heartbeat_at",
                schema: "fleet",
                table: "robots",
                column: "last_heartbeat_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_robots_is_online",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropIndex(
                name: "i_x_robots_last_heartbeat_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "angular_velocity",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "current_command_id",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "error_code",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "is_online",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "last_heartbeat_boot_id",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "last_heartbeat_sequence",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "last_telemetry_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "last_telemetry_boot_id",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "last_telemetry_sequence",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "linear_velocity",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "localization_status",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "map_version_code",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "navigation_status",
                schema: "fleet",
                table: "robots");
        }
    }
}
