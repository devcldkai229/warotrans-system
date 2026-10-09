using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkflowStepConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "config",
                schema: "execution",
                table: "workflow_steps",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "config",
                schema: "execution",
                table: "workflow_steps");
        }
    }
}
