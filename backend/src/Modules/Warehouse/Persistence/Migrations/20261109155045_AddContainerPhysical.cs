using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContainerPhysical : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "length_m",
                schema: "warehouse",
                table: "containers",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "weight_kg",
                schema: "warehouse",
                table: "containers",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "width_m",
                schema: "warehouse",
                table: "containers",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "length_m",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "weight_kg",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "width_m",
                schema: "warehouse",
                table: "containers");
        }
    }
}
