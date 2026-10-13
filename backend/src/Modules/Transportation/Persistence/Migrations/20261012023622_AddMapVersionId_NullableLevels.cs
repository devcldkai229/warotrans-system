using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMapVersionId_NullableLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "map_version_id",
                schema: "transportation",
                table: "transport_requests",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AlterColumn<short>(
                name: "source_level_no",
                schema: "transportation",
                table: "transport_request_details",
                type: "smallint",
                nullable: true,
                oldClrType: typeof(short),
                oldType: "smallint");

            migrationBuilder.AlterColumn<short>(
                name: "destination_level_no",
                schema: "transportation",
                table: "transport_request_details",
                type: "smallint",
                nullable: true,
                oldClrType: typeof(short),
                oldType: "smallint");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_map_version_id",
                schema: "transportation",
                table: "transport_requests",
                column: "map_version_id");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_requested_by",
                schema: "transportation",
                table: "transport_requests",
                column: "requested_by");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_status",
                schema: "transportation",
                table: "transport_requests",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_status_submitted_at",
                schema: "transportation",
                table: "transport_requests",
                columns: new[] { "status", "submitted_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_transport_requests_map_version_id",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropIndex(
                name: "i_x_transport_requests_requested_by",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropIndex(
                name: "i_x_transport_requests_status",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropIndex(
                name: "i_x_transport_requests_status_submitted_at",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "map_version_id",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.AlterColumn<short>(
                name: "source_level_no",
                schema: "transportation",
                table: "transport_request_details",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0,
                oldClrType: typeof(short),
                oldType: "smallint",
                oldNullable: true);

            migrationBuilder.AlterColumn<short>(
                name: "destination_level_no",
                schema: "transportation",
                table: "transport_request_details",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0,
                oldClrType: typeof(short),
                oldType: "smallint",
                oldNullable: true);
        }
    }
}
