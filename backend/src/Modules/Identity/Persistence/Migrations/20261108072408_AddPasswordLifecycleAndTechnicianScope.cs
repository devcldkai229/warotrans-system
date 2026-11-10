using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPasswordLifecycleAndTechnicianScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "must_change_password",
                schema: "identity",
                table: "accounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "password_changed_at",
                schema: "identity",
                table: "accounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "technician_robot_scopes",
                schema: "identity",
                columns: table => new
                {
                    account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assigned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    assigned_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_technician_robot_scopes", x => new { x.account_id, x.robot_id });
                    table.ForeignKey(
                        name: "f_k_technician_robot_scopes_accounts_account_id",
                        column: x => x.account_id,
                        principalSchema: "identity",
                        principalTable: "accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_technician_robot_scopes_robot_id",
                schema: "identity",
                table: "technician_robot_scopes",
                column: "robot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "technician_robot_scopes",
                schema: "identity");

            migrationBuilder.DropColumn(
                name: "must_change_password",
                schema: "identity",
                table: "accounts");

            migrationBuilder.DropColumn(
                name: "password_changed_at",
                schema: "identity",
                table: "accounts");
        }
    }
}
