using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "warehouse");

            migrationBuilder.CreateTable(
                name: "containers",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    barcode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    supplier_package_barcode = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    current_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    current_level_no = table.Column<short>(type: "smallint", nullable: true),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_containers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "inventory_stocks",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    storage_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    level_no = table.Column<short>(type: "smallint", nullable: false),
                    container_count = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_inventory_stocks", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "product_categories",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_product_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "products",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    supplier_barcode = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_products", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "storage_locations",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_storage_locations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "warehouses",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    address = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    timezone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_warehouses", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_containers_barcode",
                schema: "warehouse",
                table: "containers",
                column: "barcode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_inventory_stocks_product_id_storage_location_id_level_no",
                schema: "warehouse",
                table: "inventory_stocks",
                columns: new[] { "product_id", "storage_location_id", "level_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_product_categories_code",
                schema: "warehouse",
                table: "product_categories",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_products_sku",
                schema: "warehouse",
                table: "products",
                column: "sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_products_supplier_barcode",
                schema: "warehouse",
                table: "products",
                column: "supplier_barcode",
                unique: true,
                filter: "supplier_barcode IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "i_x_storage_locations_endpoint_id",
                schema: "warehouse",
                table: "storage_locations",
                column: "endpoint_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_warehouses_code",
                schema: "warehouse",
                table: "warehouses",
                column: "code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "containers",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "inventory_stocks",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "product_categories",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "products",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "storage_locations",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "warehouses",
                schema: "warehouse");
        }
    }
}
