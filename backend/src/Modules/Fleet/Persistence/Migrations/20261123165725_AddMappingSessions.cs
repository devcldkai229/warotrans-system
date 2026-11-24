using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMappingSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mapping_sessions",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    map_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    start_command_id = table.Column<Guid>(type: "uuid", nullable: true),
                    stop_command_id = table.Column<Guid>(type: "uuid", nullable: true),
                    started_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    started_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    mapping_since = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    stop_requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    error_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    error_message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    result_map_version_id = table.Column<Guid>(type: "uuid", nullable: true),
                    result_map_version_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    known_area_m2 = table.Column<double>(type: "double precision", nullable: true),
                    map_width = table.Column<int>(type: "integer", nullable: true),
                    map_height = table.Column<int>(type: "integer", nullable: true),
                    robot_path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_mapping_sessions", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_mapping_sessions_start_command_id",
                schema: "fleet",
                table: "mapping_sessions",
                column: "start_command_id");

            migrationBuilder.CreateIndex(
                name: "i_x_mapping_sessions_stop_command_id",
                schema: "fleet",
                table: "mapping_sessions",
                column: "stop_command_id");

            migrationBuilder.CreateIndex(
                name: "i_x_mapping_sessions_warehouse_id_started_at",
                schema: "fleet",
                table: "mapping_sessions",
                columns: new[] { "warehouse_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "ux_mapping_sessions_robot_open",
                schema: "fleet",
                table: "mapping_sessions",
                column: "robot_id",
                unique: true,
                filter: "status IN ('STARTING','MAPPING','SAVING','CANCELLING')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mapping_sessions",
                schema: "fleet");
        }
    }
}
