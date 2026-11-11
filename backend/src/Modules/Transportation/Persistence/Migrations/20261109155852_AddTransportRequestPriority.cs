using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransportRequestPriority : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deadline_at",
                schema: "transportation",
                table: "transport_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "priority",
                schema: "transportation",
                table: "transport_requests",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deadline_at",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "priority",
                schema: "transportation",
                table: "transport_requests");
        }
    }
}
