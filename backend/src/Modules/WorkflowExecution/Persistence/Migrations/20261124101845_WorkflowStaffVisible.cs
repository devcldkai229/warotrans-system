using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WorkflowStaffVisible : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "staff_visible",
                schema: "execution",
                table: "workflows",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // Robot care workflows are not for the warehouse floor: hidden from Staff (an administrator can change it).
            migrationBuilder.Sql(
                "UPDATE execution.workflows SET staff_visible = false WHERE code IN ('ROBOT_CHARGING', 'ROBOT_RETURN_TO_PARK');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "staff_visible",
                schema: "execution",
                table: "workflows");
        }
    }
}
