using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotPositioningIntents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "robot_positioning_intents",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    target_endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    navigate_command_id = table.Column<Guid>(type: "uuid", nullable: true),
                    yield_to_job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    cancel_requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    end_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_robot_positioning_intents", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_robot_positioning_intents_navigate_command_id",
                schema: "fleet",
                table: "robot_positioning_intents",
                column: "navigate_command_id");

            migrationBuilder.CreateIndex(
                name: "ux_positioning_live_endpoint",
                schema: "fleet",
                table: "robot_positioning_intents",
                column: "target_endpoint_id",
                unique: true,
                filter: "status IN ('NAVIGATING', 'YIELDING')");

            migrationBuilder.CreateIndex(
                name: "ux_positioning_live_robot",
                schema: "fleet",
                table: "robot_positioning_intents",
                column: "robot_id",
                unique: true,
                filter: "status IN ('NAVIGATING', 'YIELDING')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "robot_positioning_intents",
                schema: "fleet");
        }
    }
}
