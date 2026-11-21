using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Fleet.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SequenceManualDriveLease : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "manual_lease_id",
                schema: "fleet",
                table: "robots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "manual_lease_last_sequence",
                schema: "fleet",
                table: "robots",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "manual_lease_id",
                schema: "fleet",
                table: "robots");

            migrationBuilder.DropColumn(
                name: "manual_lease_last_sequence",
                schema: "fleet",
                table: "robots");
        }
    }
}
