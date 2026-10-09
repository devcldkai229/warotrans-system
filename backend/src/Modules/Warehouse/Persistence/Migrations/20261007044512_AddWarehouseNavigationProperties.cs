using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseNavigationProperties : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "i_x_inventory_stocks_storage_location_id",
                schema: "warehouse",
                table: "inventory_stocks",
                column: "storage_location_id");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_current_storage_location_id",
                schema: "warehouse",
                table: "containers",
                column: "current_storage_location_id");

            migrationBuilder.CreateIndex(
                name: "i_x_containers_product_id",
                schema: "warehouse",
                table: "containers",
                column: "product_id");

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_products_product_id",
                schema: "warehouse",
                table: "containers",
                column: "product_id",
                principalSchema: "warehouse",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "f_k_containers_storage_locations_current_storage_location_id",
                schema: "warehouse",
                table: "containers",
                column: "current_storage_location_id",
                principalSchema: "warehouse",
                principalTable: "storage_locations",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "f_k_inventory_stocks_products_product_id",
                schema: "warehouse",
                table: "inventory_stocks",
                column: "product_id",
                principalSchema: "warehouse",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "f_k_inventory_stocks_storage_locations_storage_location_id",
                schema: "warehouse",
                table: "inventory_stocks",
                column: "storage_location_id",
                principalSchema: "warehouse",
                principalTable: "storage_locations",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "f_k_containers_products_product_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropForeignKey(
                name: "f_k_containers_storage_locations_current_storage_location_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropForeignKey(
                name: "f_k_inventory_stocks_products_product_id",
                schema: "warehouse",
                table: "inventory_stocks");

            migrationBuilder.DropForeignKey(
                name: "f_k_inventory_stocks_storage_locations_storage_location_id",
                schema: "warehouse",
                table: "inventory_stocks");

            migrationBuilder.DropIndex(
                name: "i_x_inventory_stocks_storage_location_id",
                schema: "warehouse",
                table: "inventory_stocks");

            migrationBuilder.DropIndex(
                name: "i_x_containers_current_storage_location_id",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropIndex(
                name: "i_x_containers_product_id",
                schema: "warehouse",
                table: "containers");
        }
    }
}
