using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHandoverConfirmationSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "confirmed_by",
                schema: "execution",
                table: "handover_confirmations",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "confirmation_source",
                schema: "execution",
                table: "handover_confirmations",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "STAFF_APP");

            migrationBuilder.AddColumn<Guid>(
                name: "confirmed_by_robot_id",
                schema: "execution",
                table: "handover_confirmations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_message_id",
                schema: "execution",
                table: "handover_confirmations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "i_x_handover_confirmations_source_message_id",
                schema: "execution",
                table: "handover_confirmations",
                column: "source_message_id",
                unique: true,
                filter: "\"source_message_id\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_handover_confirmations_source_message_id",
                schema: "execution",
                table: "handover_confirmations");

            migrationBuilder.DropColumn(
                name: "confirmation_source",
                schema: "execution",
                table: "handover_confirmations");

            migrationBuilder.DropColumn(
                name: "confirmed_by_robot_id",
                schema: "execution",
                table: "handover_confirmations");

            migrationBuilder.DropColumn(
                name: "source_message_id",
                schema: "execution",
                table: "handover_confirmations");

            migrationBuilder.AlterColumn<Guid>(
                name: "confirmed_by",
                schema: "execution",
                table: "handover_confirmations",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
