using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class QueueStockHandovers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "stock_handover_outbox",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    next_attempt_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_stock_handover_outbox", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_stock_handover_outbox_job_id_container_id_type",
                schema: "execution",
                table: "stock_handover_outbox",
                columns: new[] { "job_id", "container_id", "type" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_stock_handover_outbox_next_attempt_at",
                schema: "execution",
                table: "stock_handover_outbox",
                column: "next_attempt_at");

            migrationBuilder.CreateIndex(
                name: "i_x_stock_handover_outbox_transport_request_id",
                schema: "execution",
                table: "stock_handover_outbox",
                column: "transport_request_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_handover_outbox",
                schema: "execution");
        }
    }
}
