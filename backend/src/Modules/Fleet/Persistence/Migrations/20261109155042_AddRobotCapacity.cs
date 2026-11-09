using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRobotCapacity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "length_m",
                schema: "fleet",
                table: "robots",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "max_containers",
                schema: "fleet",
                table: "robots",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "max_payload_kg",
                schema: "fleet",
                table: "robots",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "width_m",
                schema: "fleet",
                table: "robots",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "length_m",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "max_containers",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "max_payload_kg",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "width_m",
                schema: "fleet",
                table: "robots");
        }
    }
}
