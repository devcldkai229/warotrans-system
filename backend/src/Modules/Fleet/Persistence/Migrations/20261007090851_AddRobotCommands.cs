using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotCommands : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "robot_commands",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_assignment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    job_step_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    payload_json = table.Column<string>(type: "jsonb", nullable: false),
                    target_command_id = table.Column<Guid>(type: "uuid", nullable: true),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    acked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    outcome = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    error_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    reject_reason_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_robot_commands", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_robot_commands_job_assignment_id",
                schema: "fleet",
                table: "robot_commands",
                column: "job_assignment_id");

            migrationBuilder.CreateIndex(
                name: "i_x_robot_commands_robot_id",
                schema: "fleet",
                table: "robot_commands",
                column: "robot_id");

            migrationBuilder.CreateIndex(
                name: "i_x_robot_commands_robot_id_status",
                schema: "fleet",
                table: "robot_commands",
                columns: new[] { "robot_id", "status" });

            migrationBuilder.CreateIndex(
                name: "i_x_robot_commands_status",
                schema: "fleet",
                table: "robot_commands",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "robot_commands",
                schema: "fleet");
        }
    }
}
