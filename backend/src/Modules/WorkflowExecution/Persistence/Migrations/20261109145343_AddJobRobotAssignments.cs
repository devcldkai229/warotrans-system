using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobRobotAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "job_robot_assignments",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_reason = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    end_reason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_robot_assignments", x => x.id);
                    table.ForeignKey(
                        name: "f_k_job_robot_assignments_jobs_job_id",
                        column: x => x.job_id,
                        principalSchema: "execution",
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_job_robot_assignments_job_id_started_at",
                schema: "execution",
                table: "job_robot_assignments",
                columns: new[] { "job_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_job_robot_assignments_robot_id_started_at",
                schema: "execution",
                table: "job_robot_assignments",
                columns: new[] { "robot_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "ux_job_robot_assignments_active_job",
                schema: "execution",
                table: "job_robot_assignments",
                column: "job_id",
                unique: true,
                filter: "ended_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_job_robot_assignments_active_robot",
                schema: "execution",
                table: "job_robot_assignments",
                column: "robot_id",
                unique: true,
                filter: "ended_at IS NULL");

            // Jobs still holding a robot get their row. If old data has two live Jobs on one robot, the newest keeps it:
            // the other shows as holding nothing and an operator sorts it out on resume.
            migrationBuilder.Sql("""
                INSERT INTO execution.job_robot_assignments (id, job_id, robot_id, start_reason, started_at)
                SELECT gen_random_uuid(), x.id, x.robot_id, 'BACKFILL', x.since
                FROM (
                    SELECT j.id,
                           (j.context_values ->> 'assignedRobotId')::uuid AS robot_id,
                           COALESCE(j.started_at, j.created_at) AS since,
                           ROW_NUMBER() OVER (
                               PARTITION BY j.context_values ->> 'assignedRobotId'
                               ORDER BY COALESCE(j.started_at, j.created_at) DESC) AS rn
                    FROM execution.jobs j
                    WHERE j.status IN ('ASSIGNED', 'RUNNING', 'PAUSED', 'REASSIGNING', 'RECOVERY_REQUIRED')
                      AND j.context_values ->> 'assignedRobotId' IS NOT NULL
                ) x
                WHERE x.rn = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_robot_assignments",
                schema: "execution");
        }
    }
}
