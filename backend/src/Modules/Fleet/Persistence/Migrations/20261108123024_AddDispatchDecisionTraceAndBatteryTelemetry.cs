using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDispatchDecisionTraceAndBatteryTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "battery_confidence",
                schema: "fleet",
                table: "robots",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "battery_estimation_mode",
                schema: "fleet",
                table: "robots",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "battery_measured_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "battery_voltage",
                schema: "fleet",
                table: "robots",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "actor_id",
                schema: "fleet",
                table: "dispatch_decisions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "override_reason",
                schema: "fleet",
                table: "dispatch_decisions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "trigger",
                schema: "fleet",
                table: "dispatch_decisions",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "battery_confidence",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_estimation_mode",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_measured_at",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "battery_voltage",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "actor_id",
                schema: "fleet",
                table: "dispatch_decisions");

            migrationBuilder.DropColumn(
                name: "override_reason",
                schema: "fleet",
                table: "dispatch_decisions");

            migrationBuilder.DropColumn(
                name: "trigger",
                schema: "fleet",
                table: "dispatch_decisions");
        }
    }
}
