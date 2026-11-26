using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCargoTransferRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "cargo_transfer_records",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recovery_case_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_custody_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    from_custody_id = table.Column<Guid>(type: "uuid", nullable: true),
                    to_custody_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    to_custody_id = table.Column<Guid>(type: "uuid", nullable: true),
                    transfer_endpoint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_cargo_transfer_records", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_cargo_transfer_records_idempotency_key",
                schema: "execution",
                table: "cargo_transfer_records",
                column: "idempotency_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_cargo_transfer_records_job_id_container_id_confirmed_at",
                schema: "execution",
                table: "cargo_transfer_records",
                columns: new[] { "job_id", "container_id", "confirmed_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_cargo_transfer_records_recovery_case_id",
                schema: "execution",
                table: "cargo_transfer_records",
                column: "recovery_case_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cargo_transfer_records",
                schema: "execution");
        }
    }
}
