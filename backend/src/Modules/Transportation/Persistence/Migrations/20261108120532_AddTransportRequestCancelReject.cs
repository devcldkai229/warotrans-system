using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransportRequestCancelReject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "cancel_reason",
                schema: "transportation",
                table: "transport_requests",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "cancel_requested_at",
                schema: "transportation",
                table: "transport_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "cancelled_by",
                schema: "transportation",
                table: "transport_requests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reject_reason",
                schema: "transportation",
                table: "transport_requests",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "rejected_at",
                schema: "transportation",
                table: "transport_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "rejected_by",
                schema: "transportation",
                table: "transport_requests",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "cancel_reason",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "cancel_requested_at",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "cancelled_by",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "reject_reason",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "rejected_at",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "rejected_by",
                schema: "transportation",
                table: "transport_requests");
        }
    }
}
