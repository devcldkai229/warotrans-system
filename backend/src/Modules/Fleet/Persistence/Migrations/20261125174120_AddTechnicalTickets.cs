using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTechnicalTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "technical_tickets",
                schema: "fleet",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    ticket_no = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    findings = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    actions_json = table.Column<string>(type: "jsonb", nullable: false),
                    checklist_json = table.Column<string>(type: "jsonb", nullable: true),
                    result = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    snapshot_json = table.Column<string>(type: "jsonb", nullable: true),
                    maintenance_record_id = table.Column<Guid>(type: "uuid", nullable: true),
                    issue_id = table.Column<Guid>(type: "uuid", nullable: true),
                    job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    completed_by_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_technical_tickets", x => x.id);
                    table.ForeignKey(
                        name: "f_k_technical_tickets_robots_robot_id",
                        column: x => x.robot_id,
                        principalSchema: "fleet",
                        principalTable: "robots",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_technical_tickets_robot_id_created_at",
                schema: "fleet",
                table: "technical_tickets",
                columns: new[] { "robot_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_technical_tickets_status_created_at",
                schema: "fleet",
                table: "technical_tickets",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_technical_tickets_ticket_no",
                schema: "fleet",
                table: "technical_tickets",
                column: "ticket_no",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "technical_tickets",
                schema: "fleet");
        }
    }
}
