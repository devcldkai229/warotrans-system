using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransportRequestDetail_DropTransportData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_transport_requests_transport_data",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.DropColumn(
                name: "transport_data",
                schema: "transportation",
                table: "transport_requests");

            migrationBuilder.CreateTable(
                name: "transport_request_details",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_level_no = table.Column<short>(type: "smallint", nullable: false),
                    destination_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    destination_endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_level_no = table.Column<short>(type: "smallint", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_request_details", x => x.id);
                    table.ForeignKey(
                        name: "f_k_transport_request_details_transport_requests_transport_requ~",
                        column: x => x.transport_request_id,
                        principalSchema: "transportation",
                        principalTable: "transport_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_transport_request_details_container_id",
                schema: "transportation",
                table: "transport_request_details",
                column: "container_id");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_request_details_status",
                schema: "transportation",
                table: "transport_request_details",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_request_details_transport_request_id",
                schema: "transportation",
                table: "transport_request_details",
                column: "transport_request_id");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_request_details_transport_request_id_container_id",
                schema: "transportation",
                table: "transport_request_details",
                columns: new[] { "transport_request_id", "container_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_transport_request_details_transport_request_id_sequence_no",
                schema: "transportation",
                table: "transport_request_details",
                columns: new[] { "transport_request_id", "sequence_no" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transport_request_details",
                schema: "transportation");

            migrationBuilder.AddColumn<string>(
                name: "transport_data",
                schema: "transportation",
                table: "transport_requests",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_transport_data",
                schema: "transportation",
                table: "transport_requests",
                column: "transport_data")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "jsonb_ops" });
        }
    }
}
