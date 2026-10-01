using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "code_sequences",
                schema: "public",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    next_value = table.Column<long>(type: "bigint", nullable: false),
                    day_bucket = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_code_sequences", x => x.key);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "code_sequences",
                schema: "public");
        }
    }
}
