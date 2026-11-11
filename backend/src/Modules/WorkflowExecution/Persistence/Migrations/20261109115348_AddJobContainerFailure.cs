using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobContainerFailure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "failed_at",
                schema: "execution",
                table: "job_containers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "failure_code",
                schema: "execution",
                table: "job_containers",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "failure_message",
                schema: "execution",
                table: "job_containers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "failed_at",
                schema: "execution",
                table: "job_containers");

            migrationBuilder.DropColumn(
                name: "failure_code",
                schema: "execution",
                table: "job_containers");

            migrationBuilder.DropColumn(
                name: "failure_message",
                schema: "execution",
                table: "job_containers");
        }
    }
}
