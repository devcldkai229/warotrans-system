using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDispatchDecisionRefusal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "refusal_code",
                schema: "fleet",
                table: "dispatch_decisions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "refusal_code",
                schema: "fleet",
                table: "dispatch_decisions");
        }
    }
}
