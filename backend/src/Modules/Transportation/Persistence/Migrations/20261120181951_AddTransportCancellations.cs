using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransportCancellations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "actor_account_id",
                schema: "transportation",
                table: "stock_postings",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "transport_cancellations",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    scope = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    target_detail_ids = table.Column<string>(type: "jsonb", nullable: true),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    reason_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    requested_by = table.Column<Guid>(type: "uuid", nullable: true),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    finalized_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    idempotency_key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_cancellations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "transport_cancellation_items",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    cancellation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_no = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    robot_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    stage = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    containers = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_cancellation_items", x => x.id);
                    table.ForeignKey(
                        name: "f_k_transport_cancellation_items_transport_cancellations_cancel~",
                        column: x => x.cancellation_id,
                        principalSchema: "transportation",
                        principalTable: "transport_cancellations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_transport_cancellation_items_cancellation_id_job_id",
                schema: "transportation",
                table: "transport_cancellation_items",
                columns: new[] { "cancellation_id", "job_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_transport_cancellation_items_job_id",
                schema: "transportation",
                table: "transport_cancellation_items",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_cancellations_idempotency_key",
                schema: "transportation",
                table: "transport_cancellations",
                column: "idempotency_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_transport_cancellations_status",
                schema: "transportation",
                table: "transport_cancellations",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_transport_cancellations_active_per_request",
                schema: "transportation",
                table: "transport_cancellations",
                column: "transport_request_id",
                unique: true,
                filter: "status <> 'FINALIZED'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transport_cancellation_items",
                schema: "transportation");

            migrationBuilder.DropTable(
                name: "transport_cancellations",
                schema: "transportation");

            migrationBuilder.DropColumn(
                name: "actor_account_id",
                schema: "transportation",
                table: "stock_postings");
        }
    }
}
