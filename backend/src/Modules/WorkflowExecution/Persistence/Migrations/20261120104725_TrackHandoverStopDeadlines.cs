using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TrackHandoverStopDeadlines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "handover_heartbeat_at",
                schema: "execution",
                table: "job_tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "handover_work_deadline",
                schema: "execution",
                table: "job_tasks",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "handover_heartbeat_at",
                schema: "execution",
                table: "job_tasks");

            migrationBuilder.DropColumn(
                name: "handover_work_deadline",
                schema: "execution",
                table: "job_tasks");
        }
    }
}
