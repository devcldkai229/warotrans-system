using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStockVouchers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "stock_vouchers",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reference_no = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_by = table.Column<Guid>(type: "uuid", nullable: true),
                    cancelled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_stock_vouchers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "stock_voucher_lines",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    stock_voucher_id = table.Column<Guid>(type: "uuid", nullable: false),
                    line_no = table.Column<int>(type: "integer", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_stock_voucher_lines", x => x.id);
                    table.ForeignKey(
                        name: "f_k_stock_voucher_lines_containers_container_id",
                        column: x => x.container_id,
                        principalSchema: "warehouse",
                        principalTable: "containers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "f_k_stock_voucher_lines_products_product_id",
                        column: x => x.product_id,
                        principalSchema: "warehouse",
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "f_k_stock_voucher_lines_stock_vouchers_stock_voucher_id",
                        column: x => x.stock_voucher_id,
                        principalSchema: "warehouse",
                        principalTable: "stock_vouchers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_stock_voucher_lines_container_id",
                schema: "warehouse",
                table: "stock_voucher_lines",
                column: "container_id");

            migrationBuilder.CreateIndex(
                name: "i_x_stock_voucher_lines_product_id",
                schema: "warehouse",
                table: "stock_voucher_lines",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "i_x_stock_voucher_lines_stock_voucher_id_container_id",
                schema: "warehouse",
                table: "stock_voucher_lines",
                columns: new[] { "stock_voucher_id", "container_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_stock_voucher_lines_stock_voucher_id_line_no",
                schema: "warehouse",
                table: "stock_voucher_lines",
                columns: new[] { "stock_voucher_id", "line_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_stock_vouchers_code",
                schema: "warehouse",
                table: "stock_vouchers",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_stock_vouchers_warehouse_id_type_status",
                schema: "warehouse",
                table: "stock_vouchers",
                columns: new[] { "warehouse_id", "type", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_voucher_lines",
                schema: "warehouse");

            migrationBuilder.DropTable(
                name: "stock_vouchers",
                schema: "warehouse");
        }
    }
}
