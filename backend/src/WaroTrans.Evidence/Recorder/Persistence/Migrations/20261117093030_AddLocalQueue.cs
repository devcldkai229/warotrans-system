using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Evidence.Recorder.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "local_queue_messages",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    queue = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    visible_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    receive_count = table.Column<int>(type: "integer", nullable: false),
                    receipt_handle = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_local_queue_messages", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_local_queue_messages_queue_visible_at_utc",
                schema: "evidence",
                table: "local_queue_messages",
                columns: new[] { "queue", "visible_at_utc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "local_queue_messages",
                schema: "evidence");
        }
    }
}
