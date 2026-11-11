using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStockPostings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "stock_postings",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    destination_level_no = table.Column<short>(type: "smallint", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    next_attempt_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    posted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_stock_postings", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_stock_postings_created_at",
                schema: "transportation",
                table: "stock_postings",
                column: "created_at",
                filter: "posted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "i_x_stock_postings_key",
                schema: "transportation",
                table: "stock_postings",
                column: "key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_postings",
                schema: "transportation");
        }
    }
}
