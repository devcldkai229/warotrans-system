using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEndpointStorageLocationCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "storage_location_code",
                schema: "navigation",
                table: "endpoints",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_map_version_id_storage_location_code",
                schema: "navigation",
                table: "endpoints",
                columns: new[] { "map_version_id", "storage_location_code" },
                unique: true,
                filter: "storage_location_code IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_endpoints_map_version_id_storage_location_code",
                schema: "navigation",
                table: "endpoints");

            migrationBuilder.DropColumn(
                name: "storage_location_code",
                schema: "navigation",
                table: "endpoints");
        }
    }
}
