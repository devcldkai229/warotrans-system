using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobRecoveryCases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "job_recovery_cases",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_robot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    to_robot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recovery_endpoint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    move_step_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    container_ids = table.Column<string>(type: "jsonb", nullable: false),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_recovery_cases", x => x.id);
                    table.ForeignKey(
                        name: "f_k_job_recovery_cases_jobs_job_id",
                        column: x => x.job_id,
                        principalSchema: "execution",
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_job_recovery_cases_to_robot_id",
                schema: "execution",
                table: "job_recovery_cases",
                column: "to_robot_id");

            migrationBuilder.CreateIndex(
                name: "ux_job_recovery_cases_open_job",
                schema: "execution",
                table: "job_recovery_cases",
                column: "job_id",
                unique: true,
                filter: "resolved_at IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_recovery_cases",
                schema: "execution");
        }
    }
}
