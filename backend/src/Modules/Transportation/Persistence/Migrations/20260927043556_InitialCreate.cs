using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "transportation");

            migrationBuilder.CreateTable(
                name: "transport_requests",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_by = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    transport_data = table.Column<string>(type: "jsonb", nullable: false),
                    plan_schema_version = table.Column<int>(type: "integer", nullable: false),
                    workflow_inputs = table.Column<string>(type: "jsonb", nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    queued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    failure_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    failure_message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_requests", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_request_code",
                schema: "transportation",
                table: "transport_requests",
                column: "request_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_transport_requests_transport_data",
                schema: "transportation",
                table: "transport_requests",
                column: "transport_data")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "jsonb_ops" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transport_requests",
                schema: "transportation");
        }
    }
}
