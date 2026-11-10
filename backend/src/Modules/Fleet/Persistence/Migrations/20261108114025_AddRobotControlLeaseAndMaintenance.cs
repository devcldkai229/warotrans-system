using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotControlLeaseAndMaintenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "capabilities",
                schema: "fleet",
                table: "robots",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "maintenance_reason",
                schema: "fleet",
                table: "robots",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "maintenance_since",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "manual_lease_holder_id",
                schema: "fleet",
                table: "robots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "manual_lease_holder_name",
                schema: "fleet",
                table: "robots",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "manual_lease_until",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "motion_held",
                schema: "fleet",
                table: "robots",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "motion_hold_changed_at",
                schema: "fleet",
                table: "robots",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "maintenance_records",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    started_by = table.Column<Guid>(type: "uuid", nullable: true),
                    started_by_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    completed_by_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    checklist_json = table.Column<string>(type: "jsonb", nullable: true),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_maintenance_records", x => x.id);
                    table.ForeignKey(
                        name: "f_k_maintenance_records_robots_robot_id",
                        column: x => x.robot_id,
                        principalSchema: "fleet",
                        principalTable: "robots",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_maintenance_records_robot_id_started_at",
                schema: "fleet",
                table: "maintenance_records",
                columns: new[] { "robot_id", "started_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "maintenance_records",
                schema: "fleet");

            migrationBuilder.DropColumn(
                name: "capabilities",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "maintenance_reason",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "maintenance_since",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "manual_lease_holder_id",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "manual_lease_holder_name",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "manual_lease_until",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "motion_held",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "motion_hold_changed_at",
                schema: "fleet",
                table: "robots");
        }
    }
}
