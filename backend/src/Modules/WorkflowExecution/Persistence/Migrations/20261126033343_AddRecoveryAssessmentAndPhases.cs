using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecoveryAssessmentAndPhases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "assessed_at",
                schema: "execution",
                table: "job_recovery_cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "assessed_by",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "assessment_checklist_json",
                schema: "execution",
                table: "job_recovery_cases",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "assessment_note",
                schema: "execution",
                table: "job_recovery_cases",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "assessment_result",
                schema: "execution",
                table: "job_recovery_cases",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "fault_error_code",
                schema: "execution",
                table: "job_recovery_cases",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "fault_map_version_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "fault_robot_online",
                schema: "execution",
                table: "job_recovery_cases",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_pose_at",
                schema: "execution",
                table: "job_recovery_cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "last_pose_x",
                schema: "execution",
                table: "job_recovery_cases",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "last_pose_y",
                schema: "execution",
                table: "job_recovery_cases",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "last_pose_yaw",
                schema: "execution",
                table: "job_recovery_cases",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "location_verified",
                schema: "execution",
                table: "job_recovery_cases",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "location_verified_at",
                schema: "execution",
                table: "job_recovery_cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "location_verified_by",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phase",
                schema: "execution",
                table: "job_recovery_cases",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recovery_mode",
                schema: "execution",
                table: "job_recovery_cases",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_endpoint_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_move_step_id",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "source_secured_at",
                schema: "execution",
                table: "job_recovery_cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_secured_by",
                schema: "execution",
                table: "job_recovery_cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "verified_x",
                schema: "execution",
                table: "job_recovery_cases",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "verified_y",
                schema: "execution",
                table: "job_recovery_cases",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "assessed_at",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "assessed_by",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "assessment_checklist_json",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "assessment_note",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "assessment_result",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "fault_error_code",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "fault_map_version_id",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "fault_robot_online",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "last_pose_at",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "last_pose_x",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "last_pose_y",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "last_pose_yaw",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "location_verified",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "location_verified_at",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "location_verified_by",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "phase",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "recovery_mode",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "source_endpoint_id",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "source_move_step_id",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "source_secured_at",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "source_secured_by",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "verified_x",
                schema: "execution",
                table: "job_recovery_cases");

            migrationBuilder.DropColumn(
                name: "verified_y",
                schema: "execution",
                table: "job_recovery_cases");
        }
    }
}
