using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHumanStepClaims : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "claim_expires_at",
                schema: "execution",
                table: "job_steps",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "claim_version",
                schema: "execution",
                table: "job_steps",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "claimed_at",
                schema: "execution",
                table: "job_steps",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "claimed_by",
                schema: "execution",
                table: "job_steps",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deadline_at",
                schema: "execution",
                table: "job_steps",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "escalated_at",
                schema: "execution",
                table: "job_steps",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_job_steps_status_step_type",
                schema: "execution",
                table: "job_steps",
                columns: new[] { "status", "step_type" });

            // Steps already waiting keep the deadline they had in their JSON, and stay escalated if they were.
            migrationBuilder.Sql("""
                UPDATE execution.job_steps
                SET deadline_at = (output_values ->> 'humanWaitingSince')::timestamptz
                                  + make_interval(secs => COALESCE((output_values ->> 'humanConfirmTimeoutSec')::int, 300)),
                    escalated_at = (output_values ->> 'humanTimeoutAt')::timestamptz
                WHERE status = 'WAITING'
                  AND step_type = 'HUMAN_INTERACTION'
                  AND output_values ->> 'humanWaitingSince' IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_job_steps_status_step_type",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "claim_expires_at",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "claim_version",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "claimed_at",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "claimed_by",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "deadline_at",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "escalated_at",
                schema: "execution",
                table: "job_steps");
        }
    }
}
