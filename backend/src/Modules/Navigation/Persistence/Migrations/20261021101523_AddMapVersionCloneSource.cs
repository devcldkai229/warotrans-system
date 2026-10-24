using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMapVersionCloneSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "source_map_version_id",
                schema: "navigation",
                table: "map_versions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_endpoint_id",
                schema: "navigation",
                table: "endpoints",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_source_endpoint_id",
                schema: "navigation",
                table: "endpoints",
                column: "source_endpoint_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_endpoints_source_endpoint_id",
                schema: "navigation",
                table: "endpoints");

            migrationBuilder.DropColumn(
                name: "source_map_version_id",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "source_endpoint_id",
                schema: "navigation",
                table: "endpoints");
        }
    }
}
