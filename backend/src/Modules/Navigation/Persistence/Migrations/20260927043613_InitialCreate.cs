using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "navigation");

            migrationBuilder.CreateTable(
                name: "edges",
                schema: "navigation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    geometry = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    direction = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    capacity = table.Column<int>(type: "integer", nullable: false),
                    max_speed = table.Column<double>(type: "double precision", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_edges", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "endpoint_group_members",
                schema: "navigation",
                columns: table => new
                {
                    endpoint_group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    endpoint_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_endpoint_group_members", x => new { x.endpoint_group_id, x.endpoint_id });
                });

            migrationBuilder.CreateTable(
                name: "endpoint_groups",
                schema: "navigation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    selection_policy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_endpoint_groups", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "endpoints",
                schema: "navigation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    endpoint_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    x = table.Column<double>(type: "double precision", nullable: false),
                    y = table.Column<double>(type: "double precision", nullable: false),
                    yaw = table.Column<double>(type: "double precision", nullable: false),
                    position_tolerance = table.Column<double>(type: "double precision", nullable: false),
                    yaw_tolerance = table.Column<double>(type: "double precision", nullable: false),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_endpoints", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "map_versions",
                schema: "navigation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version_no = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    map_uri = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    resolution = table.Column<double>(type: "double precision", nullable: false),
                    origin_x = table.Column<double>(type: "double precision", nullable: false),
                    origin_y = table.Column<double>(type: "double precision", nullable: false),
                    origin_yaw = table.Column<double>(type: "double precision", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_map_versions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "zones",
                schema: "navigation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    zone_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    geometry = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    capacity = table.Column<int>(type: "integer", nullable: false),
                    max_speed = table.Column<double>(type: "double precision", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_zones", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_edges_code",
                schema: "navigation",
                table: "edges",
                column: "code");

            migrationBuilder.CreateIndex(
                name: "i_x_edges_is_active",
                schema: "navigation",
                table: "edges",
                column: "is_active");

            migrationBuilder.CreateIndex(
                name: "i_x_edges_map_version_id",
                schema: "navigation",
                table: "edges",
                column: "map_version_id");

            migrationBuilder.CreateIndex(
                name: "i_x_edges_map_version_id_code",
                schema: "navigation",
                table: "edges",
                columns: new[] { "map_version_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_endpoint_group_members_endpoint_id",
                schema: "navigation",
                table: "endpoint_group_members",
                column: "endpoint_id");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoint_groups_code",
                schema: "navigation",
                table: "endpoint_groups",
                column: "code");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoint_groups_is_active",
                schema: "navigation",
                table: "endpoint_groups",
                column: "is_active");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoint_groups_map_version_id",
                schema: "navigation",
                table: "endpoint_groups",
                column: "map_version_id");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoint_groups_map_version_id_code",
                schema: "navigation",
                table: "endpoint_groups",
                columns: new[] { "map_version_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_code",
                schema: "navigation",
                table: "endpoints",
                column: "code");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_is_enabled",
                schema: "navigation",
                table: "endpoints",
                column: "is_enabled");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_map_version_id",
                schema: "navigation",
                table: "endpoints",
                column: "map_version_id");

            migrationBuilder.CreateIndex(
                name: "i_x_endpoints_map_version_id_code",
                schema: "navigation",
                table: "endpoints",
                columns: new[] { "map_version_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_map_versions_warehouse_id_version_no",
                schema: "navigation",
                table: "map_versions",
                columns: new[] { "warehouse_id", "version_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_zones_code",
                schema: "navigation",
                table: "zones",
                column: "code");

            migrationBuilder.CreateIndex(
                name: "i_x_zones_is_active",
                schema: "navigation",
                table: "zones",
                column: "is_active");

            migrationBuilder.CreateIndex(
                name: "i_x_zones_map_version_id",
                schema: "navigation",
                table: "zones",
                column: "map_version_id");

            migrationBuilder.CreateIndex(
                name: "i_x_zones_map_version_id_code",
                schema: "navigation",
                table: "zones",
                columns: new[] { "map_version_id", "code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "edges",
                schema: "navigation");

            migrationBuilder.DropTable(
                name: "endpoint_group_members",
                schema: "navigation");

            migrationBuilder.DropTable(
                name: "endpoint_groups",
                schema: "navigation");

            migrationBuilder.DropTable(
                name: "endpoints",
                schema: "navigation");

            migrationBuilder.DropTable(
                name: "map_versions",
                schema: "navigation");

            migrationBuilder.DropTable(
                name: "zones",
                schema: "navigation");
        }
    }
}
