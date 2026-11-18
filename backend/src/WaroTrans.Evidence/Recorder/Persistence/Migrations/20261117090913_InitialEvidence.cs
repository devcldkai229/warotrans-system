using System;
using System.Collections.Generic;
using System.Net;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WaroTrans.Evidence.Recorder.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "evidence");

            migrationBuilder.CreateTable(
                name: "clock_anchors",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    robot_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    boot_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    monotonic_ns = table.Column<long>(type: "bigint", nullable: false),
                    utc_estimate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    sync_source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    offset_ms = table.Column<double>(type: "double precision", nullable: true),
                    error_bound_ms = table.Column<double>(type: "double precision", nullable: true),
                    synchronized = table.Column<bool>(type: "boolean", nullable: false),
                    received_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clock_anchors", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "inbox",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    message_id = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    event_type = table.Column<string>(type: "character varying(96)", maxLength: 96, nullable: true),
                    payload_version = table.Column<short>(type: "smallint", nullable: false),
                    processed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    hash = table.Column<string>(type: "char(64)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inbox", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "journals",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    requested_container_count = table.Column<int>(type: "integer", nullable: false),
                    transport_status_snapshot = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    transport_status_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    first_started_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_ended_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    retention_hold_until_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_reconciled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    row_version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_journals", x => x.id);
                    table.CheckConstraint("ck_journals_requested_container_count", "requested_container_count >= 0");
                });

            migrationBuilder.CreateTable(
                name: "outbox",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_type = table.Column<string>(type: "character varying(96)", maxLength: 96, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    published_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox", x => x.id);
                    table.CheckConstraint("ck_outbox_attempts", "attempt_count >= 0");
                });

            migrationBuilder.CreateTable(
                name: "robot_credentials",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    token_sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    issued_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_used_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_robot_credentials", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "access_audits",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    journal_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    action = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    resource_id = table.Column<Guid>(type: "uuid", nullable: true),
                    occurred_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ip_address = table.Column<IPAddress>(type: "inet", nullable: true),
                    result = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    request_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    detail = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_access_audits", x => x.id);
                    table.ForeignKey(
                        name: "fk_access_audits_journal_id",
                        column: x => x.journal_id,
                        principalSchema: "evidence",
                        principalTable: "journals",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "robot_runs",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    journal_id = table.Column<Guid>(type: "uuid", nullable: false),
                    run_correlation_key = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    source_job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_job_no = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    source_job_task_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_assignment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    robot_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    robot_source_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assigned_container_ids = table.Column<List<Guid>>(type: "uuid[]", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    transport_run_status_snapshot = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    start_reason = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    map_id = table.Column<Guid>(type: "uuid", nullable: true),
                    map_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    frame_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    started_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ended_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    clock_offset_estimate_ms = table.Column<double>(type: "double precision", nullable: true),
                    time_sync_error_bound_ms = table.Column<double>(type: "double precision", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_robot_runs", x => x.id);
                    table.ForeignKey(
                        name: "fk_robot_runs_journal_id",
                        column: x => x.journal_id,
                        principalSchema: "evidence",
                        principalTable: "journals",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "annotations",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    journal_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_run_evidence_id = table.Column<Guid>(type: "uuid", nullable: true),
                    author_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    note = table.Column<string>(type: "text", nullable: false),
                    snapshot_s3_key = table.Column<string>(type: "text", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    deleted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_annotations", x => x.id);
                    table.CheckConstraint("ck_annotations_note_length", "char_length(note) <= 4000");
                    table.ForeignKey(
                        name: "fk_annotations_journal_id",
                        column: x => x.journal_id,
                        principalSchema: "evidence",
                        principalTable: "journals",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_annotations_robot_run_evidence_id",
                        column: x => x.robot_run_evidence_id,
                        principalSchema: "evidence",
                        principalTable: "robot_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "camera_recordings",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_run_evidence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    camera_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    camera_model = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    nominal_fov_degrees = table.Column<float>(type: "real", nullable: true),
                    camera_calibration_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    mount_pose = table.Column<string>(type: "jsonb", nullable: true),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    target_fps = table.Column<float>(type: "real", nullable: false),
                    source_codec = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    capture_software_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    edge_recording_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    boot_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    started_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ended_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_heartbeat_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    finalized_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expected_segment_count = table.Column<int>(type: "integer", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_camera_recordings", x => x.id);
                    table.CheckConstraint("ck_camera_recordings_size", "width > 0 AND height > 0 AND target_fps > 0");
                    table.ForeignKey(
                        name: "fk_camera_recordings_robot_run_evidence_id",
                        column: x => x.robot_run_evidence_id,
                        principalSchema: "evidence",
                        principalTable: "robot_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "events",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    journal_id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_run_evidence_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_system = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    source_event_id = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    event_type = table.Column<string>(type: "character varying(96)", maxLength: 96, nullable: false),
                    severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    occurred_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    received_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    x = table.Column<double>(type: "double precision", nullable: true),
                    y = table.Column<double>(type: "double precision", nullable: true),
                    frame_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    message = table.Column<string>(type: "text", nullable: true),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    correlation_id = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    payload_schema_version = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_events", x => x.id);
                    table.ForeignKey(
                        name: "fk_events_journal_id",
                        column: x => x.journal_id,
                        principalSchema: "evidence",
                        principalTable: "journals",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_events_robot_run_evidence_id",
                        column: x => x.robot_run_evidence_id,
                        principalSchema: "evidence",
                        principalTable: "robot_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "route_plans",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    robot_run_evidence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan_version = table.Column<long>(type: "bigint", nullable: false),
                    planner_name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    generated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    valid_until_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    frame_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    map_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    path_points = table.Column<string>(type: "jsonb", nullable: false),
                    path_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    reason = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_route_plans", x => x.id);
                    table.ForeignKey(
                        name: "fk_route_plans_robot_run_evidence_id",
                        column: x => x.robot_run_evidence_id,
                        principalSchema: "evidence",
                        principalTable: "robot_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "trajectory_points",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    robot_run_evidence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_number = table.Column<long>(type: "bigint", nullable: false),
                    captured_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    x = table.Column<double>(type: "double precision", nullable: false),
                    y = table.Column<double>(type: "double precision", nullable: false),
                    yaw_rad = table.Column<double>(type: "double precision", nullable: false),
                    linear_velocity_mps = table.Column<double>(type: "double precision", nullable: true),
                    angular_velocity_radps = table.Column<double>(type: "double precision", nullable: true),
                    pose_source = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    frame_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    localization_quality = table.Column<float>(type: "real", nullable: true),
                    is_valid = table.Column<bool>(type: "boolean", nullable: false),
                    map_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    received_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_trajectory_points", x => x.id);
                    table.ForeignKey(
                        name: "fk_trajectory_points_robot_run_evidence_id",
                        column: x => x.robot_run_evidence_id,
                        principalSchema: "evidence",
                        principalTable: "robot_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "continuity_groups",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recording_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_ordinal = table.Column<int>(type: "integer", nullable: false),
                    captured_from_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    captured_to_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    first_sequence_number = table.Column<int>(type: "integer", nullable: false),
                    last_sequence_number = table.Column<int>(type: "integer", nullable: true),
                    expected_segment_count = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    gap_reason = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    finalized_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_continuity_groups", x => x.id);
                    table.CheckConstraint("ck_continuity_groups_sequence", "first_sequence_number >= 0 AND (last_sequence_number IS NULL OR last_sequence_number >= first_sequence_number)");
                    table.ForeignKey(
                        name: "fk_continuity_groups_recording_id",
                        column: x => x.recording_id,
                        principalSchema: "evidence",
                        principalTable: "camera_recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "media_assets",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recording_id = table.Column<Guid>(type: "uuid", nullable: false),
                    continuity_group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    profile_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    output_bucket = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    output_prefix = table.Column<string>(type: "text", nullable: true),
                    master_playlist_key = table.Column<string>(type: "text", nullable: true),
                    thumbnail_key = table.Column<string>(type: "text", nullable: true),
                    duration_ms = table.Column<long>(type: "bigint", nullable: true),
                    renditions = table.Column<string>(type: "jsonb", nullable: false),
                    failure_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ready_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_media_assets", x => x.id);
                    table.ForeignKey(
                        name: "fk_media_assets_continuity_group_id",
                        column: x => x.continuity_group_id,
                        principalSchema: "evidence",
                        principalTable: "continuity_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_media_assets_recording_id",
                        column: x => x.recording_id,
                        principalSchema: "evidence",
                        principalTable: "camera_recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "video_segments",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recording_id = table.Column<Guid>(type: "uuid", nullable: false),
                    continuity_group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_number = table.Column<int>(type: "integer", nullable: false),
                    captured_from_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    captured_to_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    start_monotonic_ns = table.Column<long>(type: "bigint", nullable: false),
                    end_monotonic_ns = table.Column<long>(type: "bigint", nullable: false),
                    boot_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    duration_ms = table.Column<long>(type: "bigint", nullable: false),
                    frame_count = table.Column<int>(type: "integer", nullable: false),
                    dropped_frame_count = table.Column<int>(type: "integer", nullable: false),
                    duplicated_frame_count = table.Column<int>(type: "integer", nullable: false),
                    max_slot_error_ms = table.Column<double>(type: "double precision", nullable: true),
                    container_format = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    codec = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    byte_size = table.Column<long>(type: "bigint", nullable: false),
                    sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    s3_bucket = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    s3_key = table.Column<string>(type: "text", nullable: true),
                    s3_version_id = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    s3_etag = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    upload_status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    upload_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    uploaded_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    verified_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    upload_attempt_count = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_video_segments", x => x.id);
                    table.CheckConstraint("ck_video_segments_counts", "sequence_number >= 0 AND frame_count >= 0 AND dropped_frame_count >= 0 AND duplicated_frame_count >= 0 AND byte_size >= 0 AND duration_ms >= 0 AND upload_attempt_count >= 0");
                    table.CheckConstraint("ck_video_segments_sha256", "sha256 ~ '^[0-9a-f]{64}$'");
                    table.CheckConstraint("ck_video_segments_time", "captured_to_utc >= captured_from_utc");
                    table.ForeignKey(
                        name: "fk_video_segments_continuity_group_id",
                        column: x => x.continuity_group_id,
                        principalSchema: "evidence",
                        principalTable: "continuity_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_video_segments_recording_id",
                        column: x => x.recording_id,
                        principalSchema: "evidence",
                        principalTable: "camera_recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "media_processing_jobs",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    media_asset_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    provider_job_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    request_token = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    input_manifest_sha256 = table.Column<string>(type: "char(64)", nullable: false),
                    job_template_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    claimed_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    claimed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_error_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    last_error_message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    submitted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_media_processing_jobs", x => x.id);
                    table.CheckConstraint("ck_media_processing_jobs_attempts", "attempt_count >= 0");
                    table.ForeignKey(
                        name: "fk_media_processing_jobs_media_asset_id",
                        column: x => x.media_asset_id,
                        principalSchema: "evidence",
                        principalTable: "media_assets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "playback_spans",
                schema: "evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    media_asset_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recording_id = table.Column<Guid>(type: "uuid", nullable: false),
                    utc_start = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    utc_end = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    media_start_ms = table.Column<long>(type: "bigint", nullable: false),
                    media_end_ms = table.Column<long>(type: "bigint", nullable: false),
                    time_error_bound_ms = table.Column<float>(type: "real", nullable: true),
                    mapping_method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_playback_spans", x => x.id);
                    table.CheckConstraint("ck_playback_spans_media", "media_start_ms >= 0 AND media_end_ms >= media_start_ms");
                    table.CheckConstraint("ck_playback_spans_utc", "utc_end >= utc_start");
                    table.ForeignKey(
                        name: "fk_playback_spans_media_asset_id",
                        column: x => x.media_asset_id,
                        principalSchema: "evidence",
                        principalTable: "media_assets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_playback_spans_recording_id",
                        column: x => x.recording_id,
                        principalSchema: "evidence",
                        principalTable: "camera_recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_access_audits_actor_user_id_occurred_at_utc",
                schema: "evidence",
                table: "access_audits",
                columns: new[] { "actor_user_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_access_audits_journal_id_occurred_at_utc",
                schema: "evidence",
                table: "access_audits",
                columns: new[] { "journal_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_annotations_journal_id_at_utc",
                schema: "evidence",
                table: "annotations",
                columns: new[] { "journal_id", "at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_annotations_robot_run_evidence_id",
                schema: "evidence",
                table: "annotations",
                column: "robot_run_evidence_id");

            migrationBuilder.CreateIndex(
                name: "ix_camera_recordings_robot_run_evidence_id_started_at_utc",
                schema: "evidence",
                table: "camera_recordings",
                columns: new[] { "robot_run_evidence_id", "started_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_camera_recordings_edge_recording_key",
                schema: "evidence",
                table: "camera_recordings",
                column: "edge_recording_key",
                unique: true,
                filter: "edge_recording_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_clock_anchors_robot_id_utc_estimate",
                schema: "evidence",
                table: "clock_anchors",
                columns: new[] { "robot_id", "utc_estimate" });

            migrationBuilder.CreateIndex(
                name: "ux_clock_anchors_robot_id_boot_session_id_monotonic_ns",
                schema: "evidence",
                table: "clock_anchors",
                columns: new[] { "robot_id", "boot_session_id", "monotonic_ns" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_continuity_groups_recording_id_group_ordinal",
                schema: "evidence",
                table: "continuity_groups",
                columns: new[] { "recording_id", "group_ordinal" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_events_journal_id_occurred_at_utc",
                schema: "evidence",
                table: "events",
                columns: new[] { "journal_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_events_robot_run_evidence_id_occurred_at_utc",
                schema: "evidence",
                table: "events",
                columns: new[] { "robot_run_evidence_id", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_events_severity_occurred_at_utc",
                schema: "evidence",
                table: "events",
                columns: new[] { "severity", "occurred_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_events_source_system_source_event_id",
                schema: "evidence",
                table: "events",
                columns: new[] { "source_system", "source_event_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inbox_processed_at_utc",
                schema: "evidence",
                table: "inbox",
                column: "processed_at_utc");

            migrationBuilder.CreateIndex(
                name: "ux_inbox_source_message_id",
                schema: "evidence",
                table: "inbox",
                columns: new[] { "source", "message_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_journals_first_started_at_utc",
                schema: "evidence",
                table: "journals",
                column: "first_started_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_journals_request_code",
                schema: "evidence",
                table: "journals",
                column: "request_code");

            migrationBuilder.CreateIndex(
                name: "ix_journals_status_updated_at_utc",
                schema: "evidence",
                table: "journals",
                columns: new[] { "status", "updated_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_journals_transport_request_id",
                schema: "evidence",
                table: "journals",
                column: "transport_request_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_media_assets_recording_id_status",
                schema: "evidence",
                table: "media_assets",
                columns: new[] { "recording_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_media_assets_continuity_group_id_profile_version",
                schema: "evidence",
                table: "media_assets",
                columns: new[] { "continuity_group_id", "profile_version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_media_processing_jobs_status_created_at_utc",
                schema: "evidence",
                table: "media_processing_jobs",
                columns: new[] { "status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_media_processing_jobs_media_asset_id_input_manifest_sha256_job_template_version",
                schema: "evidence",
                table: "media_processing_jobs",
                columns: new[] { "media_asset_id", "input_manifest_sha256", "job_template_version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_media_processing_jobs_provider_provider_job_id",
                schema: "evidence",
                table: "media_processing_jobs",
                columns: new[] { "provider", "provider_job_id" },
                unique: true,
                filter: "provider_job_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_outbox_created_at_utc",
                schema: "evidence",
                table: "outbox",
                column: "created_at_utc",
                filter: "published_at_utc IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_playback_spans_media_asset_id_media_start_ms",
                schema: "evidence",
                table: "playback_spans",
                columns: new[] { "media_asset_id", "media_start_ms" });

            migrationBuilder.CreateIndex(
                name: "ix_playback_spans_recording_id_utc_start_utc_end",
                schema: "evidence",
                table: "playback_spans",
                columns: new[] { "recording_id", "utc_start", "utc_end" });

            migrationBuilder.CreateIndex(
                name: "ix_robot_credentials_robot_code",
                schema: "evidence",
                table: "robot_credentials",
                column: "robot_code",
                filter: "revoked_at_utc IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_robot_credentials_token_sha256",
                schema: "evidence",
                table: "robot_credentials",
                column: "token_sha256",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_robot_runs_journal_id_started_at_utc",
                schema: "evidence",
                table: "robot_runs",
                columns: new[] { "journal_id", "started_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_robot_runs_robot_id_started_at_utc",
                schema: "evidence",
                table: "robot_runs",
                columns: new[] { "robot_id", "started_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_robot_runs_source_job_id",
                schema: "evidence",
                table: "robot_runs",
                column: "source_job_id");

            migrationBuilder.CreateIndex(
                name: "ux_robot_runs_journal_id_run_correlation_key",
                schema: "evidence",
                table: "robot_runs",
                columns: new[] { "journal_id", "run_correlation_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_route_plans_robot_run_evidence_id_generated_at_utc",
                schema: "evidence",
                table: "route_plans",
                columns: new[] { "robot_run_evidence_id", "generated_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_route_plans_robot_run_evidence_id_plan_version",
                schema: "evidence",
                table: "route_plans",
                columns: new[] { "robot_run_evidence_id", "plan_version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_trajectory_points_robot_run_evidence_id_captured_at_utc",
                schema: "evidence",
                table: "trajectory_points",
                columns: new[] { "robot_run_evidence_id", "captured_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_trajectory_points_robot_run_evidence_id_sequence_number",
                schema: "evidence",
                table: "trajectory_points",
                columns: new[] { "robot_run_evidence_id", "sequence_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_video_segments_continuity_group_id_sequence_number",
                schema: "evidence",
                table: "video_segments",
                columns: new[] { "continuity_group_id", "sequence_number" });

            migrationBuilder.CreateIndex(
                name: "ix_video_segments_upload_status_created_at_utc",
                schema: "evidence",
                table: "video_segments",
                columns: new[] { "upload_status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_video_segments_recording_id_sequence_number",
                schema: "evidence",
                table: "video_segments",
                columns: new[] { "recording_id", "sequence_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_video_segments_s3_bucket_s3_key",
                schema: "evidence",
                table: "video_segments",
                columns: new[] { "s3_bucket", "s3_key" },
                unique: true,
                filter: "s3_key IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "access_audits",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "annotations",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "clock_anchors",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "events",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "inbox",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "media_processing_jobs",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "outbox",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "playback_spans",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "robot_credentials",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "route_plans",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "trajectory_points",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "video_segments",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "media_assets",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "continuity_groups",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "camera_recordings",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "robot_runs",
                schema: "evidence");

            migrationBuilder.DropTable(
                name: "journals",
                schema: "evidence");
        }
    }
}
