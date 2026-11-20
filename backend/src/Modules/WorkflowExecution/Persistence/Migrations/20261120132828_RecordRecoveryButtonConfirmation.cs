using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RecordRecoveryButtonConfirmation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "button_arm_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "button_confirmation_message_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "confirmed_by_robot_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "button_arm_id",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "button_confirmation_message_id",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "confirmed_by_robot_id",
                schema: "execution",
                table: "job_recovery_cases");
        }
    }
}
