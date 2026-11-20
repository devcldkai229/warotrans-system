using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RecordHandoverStopClaims : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "handover_began_at",
                schema: "execution",
                table: "job_tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "handover_claim_move_id",
                schema: "execution",
                table: "job_tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "handover_claimed_at",
                schema: "execution",
                table: "job_tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "handover_claimed_by",
                schema: "execution",
                table: "job_tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "handover_version",
                schema: "execution",
                table: "job_tasks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "accepted_move_command_id",
                schema: "execution",
                table: "job_steps",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "move_accepted_at",
                schema: "execution",
                table: "job_steps",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "handover_began_at",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "handover_claim_move_id",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "handover_claimed_at",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "handover_claimed_by",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "handover_version",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "accepted_move_command_id",
                schema: "execution",
                table: "job_steps");

            migrationBuilder.DropColumn(
                name: "move_accepted_at",
                schema: "execution",
                table: "job_steps");
        }
    }
}
