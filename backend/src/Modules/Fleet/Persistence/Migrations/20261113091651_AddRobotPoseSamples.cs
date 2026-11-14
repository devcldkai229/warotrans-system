using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotPoseSamples : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "robot_pose_samples",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    command_id = table.Column<Guid>(type: "uuid", nullable: true),
                    x = table.Column<double>(type: "double precision", nullable: false),
                    y = table.Column<double>(type: "double precision", nullable: false),
                    yaw = table.Column<double>(type: "double precision", nullable: false),
                    linear_velocity = table.Column<double>(type: "double precision", nullable: true),
                    angular_velocity = table.Column<double>(type: "double precision", nullable: true),
                    map_version_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    recorded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_robot_pose_samples", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_robot_pose_samples_job_id_recorded_at",
                schema: "fleet",
                table: "robot_pose_samples",
                columns: new[] { "job_id", "recorded_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_robot_pose_samples_recorded_at",
                schema: "fleet",
                table: "robot_pose_samples",
                column: "recorded_at");

            migrationBuilder.CreateIndex(
                name: "i_x_robot_pose_samples_robot_id_recorded_at",
                schema: "fleet",
                table: "robot_pose_samples",
                columns: new[] { "robot_id", "recorded_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "robot_pose_samples",
                schema: "fleet");
        }
    }
}
