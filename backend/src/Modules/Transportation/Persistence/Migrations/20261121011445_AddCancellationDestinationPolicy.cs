using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCancellationDestinationPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "destination_endpoint_code",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "destination_note",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "destination_status",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "done_at",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "handover_requested_at",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "handover_requested_by",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "initial_phase",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phase",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recovery_point_code",
                schema: "transportation",
                table: "transport_cancellation_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "destination_endpoint_code",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "destination_note",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "destination_status",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "done_at",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "handover_requested_at",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "handover_requested_by",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "initial_phase",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "phase",
                schema: "transportation",
                table: "transport_cancellation_items");

            migrationBuilder.DropColumn(
                name: "recovery_point_code",
                schema: "transportation",
                table: "transport_cancellation_items");
        }
    }
}
