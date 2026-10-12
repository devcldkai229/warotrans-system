using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobProvisioningKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "provisioning_key",
                schema: "execution",
                table: "jobs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            // Existing rows (if any) must not collide on the empty default before the unique index.
            migrationBuilder.Sql(
                """
                UPDATE execution.jobs
                SET provisioning_key = 'legacy:' || id::text
                WHERE provisioning_key = '' OR provisioning_key IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_provisioning_key",
                schema: "execution",
                table: "jobs",
                column: "provisioning_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_status",
                schema: "execution",
                table: "jobs",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_status_queued_at",
                schema: "execution",
                table: "jobs",
                columns: new[] { "status", "queued_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_jobs_provisioning_key",
                schema: "execution",
                table: "jobs");

            migrationBuilder.DropIndex(
                name: "i_x_jobs_status",
                schema: "execution",
                table: "jobs");

            migrationBuilder.DropIndex(
                name: "i_x_jobs_status_queued_at",
                schema: "execution",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "provisioning_key",
                schema: "execution",
                table: "jobs");
        }
    }
}
