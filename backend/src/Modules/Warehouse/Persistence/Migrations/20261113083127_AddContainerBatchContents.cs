using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContainerBatchContents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "contents_quantity",
                schema: "warehouse",
                table: "containers",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "contents_unit",
                schema: "warehouse",
                table: "containers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "creation_group_key",
                schema: "warehouse",
                table: "containers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "creation_group_ordinal",
                schema: "warehouse",
                table: "containers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "creation_ordinal",
                schema: "warehouse",
                table: "containers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "creation_request_hash",
                schema: "warehouse",
                table: "containers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "creation_request_id",
                schema: "warehouse",
                table: "containers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_containers_creation_request",
                schema: "warehouse",
                table: "containers",
                columns: new[] { "creation_request_id", "creation_ordinal" },
                unique: true,
                filter: "creation_request_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers",
                sql: "(contents_quantity IS NULL AND contents_unit IS NULL) OR (contents_quantity IS NOT NULL AND contents_quantity > 0 AND contents_unit IS NOT NULL AND length(btrim(contents_unit)) > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(creation_request_id IS NULL AND creation_request_hash IS NULL AND creation_ordinal IS NULL AND creation_group_key IS NULL AND creation_group_ordinal IS NULL) OR (creation_request_id IS NOT NULL AND creation_request_hash IS NOT NULL AND length(creation_request_hash) = 64 AND creation_ordinal IS NOT NULL AND creation_ordinal > 0 AND creation_group_key IS NOT NULL AND length(btrim(creation_group_key)) > 0 AND creation_group_ordinal IS NOT NULL AND creation_group_ordinal > 0 AND contents_quantity IS NOT NULL AND contents_unit IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_containers_creation_request",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "contents_quantity",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "contents_unit",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "creation_group_key",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "creation_group_ordinal",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "creation_ordinal",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "creation_request_hash",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "creation_request_id",
                schema: "warehouse",
                table: "containers");
        }
    }
}
