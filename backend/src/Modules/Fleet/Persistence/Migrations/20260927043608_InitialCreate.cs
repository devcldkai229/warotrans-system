using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "fleet");

            migrationBuilder.CreateTable(
                name: "dispatch_decisions",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    candidate_evaluations = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_dispatch_decisions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "job_assignments",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    assigned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    acknowledged_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    activated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    end_reason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_assignments", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "robot_state_events",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    from_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    to_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    details = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_robot_state_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "robots",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    battery_percent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    pose_x = table.Column<double>(type: "double precision", nullable: false),
                    pose_y = table.Column<double>(type: "double precision", nullable: false),
                    pose_yaw = table.Column<double>(type: "double precision", nullable: false),
                    last_heartbeat_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_robots", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_dispatch_decisions_job_id",
                schema: "fleet",
                table: "dispatch_decisions",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "i_x_job_assignments_job_id",
                schema: "fleet",
                table: "job_assignments",
                column: "job_id",
                unique: true,
                filter: "status IN ('PENDING_ACK', 'ACKNOWLEDGED', 'ACTIVE')");

            migrationBuilder.CreateIndex(
                name: "i_x_job_assignments_robot_id",
                schema: "fleet",
                table: "job_assignments",
                column: "robot_id",
                unique: true,
                filter: "status IN ('PENDING_ACK', 'ACKNOWLEDGED', 'ACTIVE')");

            migrationBuilder.CreateIndex(
                name: "i_x_robot_state_events_occurred_at",
                schema: "fleet",
                table: "robot_state_events",
                column: "occurred_at");

            migrationBuilder.CreateIndex(
                name: "i_x_robot_state_events_robot_id",
                schema: "fleet",
                table: "robot_state_events",
                column: "robot_id");

            migrationBuilder.CreateIndex(
                name: "i_x_robots_code",
                schema: "fleet",
                table: "robots",
                column: "code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "dispatch_decisions",
                schema: "fleet");

            migrationBuilder.DropTable(
                name: "job_assignments",
                schema: "fleet");

            migrationBuilder.DropTable(
                name: "robot_state_events",
                schema: "fleet");

            migrationBuilder.DropTable(
                name: "robots",
                schema: "fleet");
        }
    }
}
