using System.Text;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Features.StreamRobotCamera;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Operations.Contracts;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Host.Extensions;
using WaroTrans.Host.Hubs;
using WaroTrans.Host.Realtime;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;
using WaroTrans.WorkflowExecution.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

builder.Services.AddBuildingBlocks(builder.Configuration);
builder.Services.AddIdentityModule(builder.Configuration);
builder.Services.AddWarehouseModule(builder.Configuration);
builder.Services.AddTransportationModule(builder.Configuration);
builder.Services.AddWorkflowExecutionModule(builder.Configuration);
builder.Services.AddFleetModule(builder.Configuration);
builder.Services.AddNavigationModule(builder.Configuration);
builder.Services.AddOperationsModule(builder.Configuration);

builder.Services.AddValidatorsFromAssemblyContaining<WaroTrans.BuildingBlocks.Abstractions.ICurrentUser>();

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (Encoding.UTF8.GetByteCount(jwtOptions.Key) < JwtOptions.MinimumKeyBytes)
{
    throw new InvalidOperationException(
        $"{JwtOptions.SectionName}:Key is required and must be at least {JwtOptions.MinimumKeyBytes} bytes.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Keep the token's own claim names (sub/name/role) instead of the legacy XML-namespace mapping.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = AppClaimTypes.Name,
            RoleClaimType = AppClaimTypes.Role
        };
        options.Events = new JwtBearerEvents
        {
            // Browsers cannot set the Authorization header on WebSocket requests (SignalR) or on an <img> (robot
            // camera MJPEG stream, map occupancy images), so those send the token here.
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken)
                    && (path.StartsWithSegments("/hubs")
                        || path.StartsWithSegments(MapAssetsPath)
                        || (path.StartsWithSegments("/api/fleet/robots")
                            && path.Value!.EndsWith(StreamRobotCameraEndpoint.PathSuffix, StringComparison.Ordinal))))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddPermissionAuthorization();
builder.Services.AddAuthorization(options =>
{
    // Legacy role policies, kept for code that has not moved to RequirePermission(...) yet.
    options.AddPolicy(AuthorizationPolicies.AdminOnly, policy =>
        policy.RequireAuthenticatedUser().RequireRole("ADMIN"));
    options.AddPolicy(AuthorizationPolicies.StaffOrAdmin, policy =>
        policy.RequireAuthenticatedUser().RequireRole("ADMIN", "STAFF"));

    // Secure by default: an endpoint without its own requirement still needs a signed-in user.
    // Public endpoints opt out with AllowAnonymous().
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        // The web client keeps its refresh token in an HttpOnly cookie.
        .AllowCredentials()));

builder.Services.AddSignalR();
builder.Services.AddSingleton<IRobotRealtimeNotifier, SignalRRobotRealtimeNotifier>();
builder.Services.AddScoped<IIntegrationEventHandler<JobStatusChanged>, SignalRJobRealtimeForwarder>();
builder.Services.AddScoped<IIntegrationEventHandler<JobStepStatusChanged>, SignalRJobRealtimeForwarder>();
builder.Services.AddScoped<IIntegrationEventHandler<NotificationCreated>, SignalRNotificationForwarder>();
builder.Services.AddScoped<IIntegrationEventHandler<JobStatusChanged>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<RobotConnectivityChanged>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<RobotCommandLifecycleChanged>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<RobotBatteryLow>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<RobotErrorReported>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<JobStepStatusChanged>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<JobWaitingToStart>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<JobStepWaitingForPerson>, AdminNotificationProducer>();
builder.Services.AddScoped<IIntegrationEventHandler<TransportRequestProgressed>, AdminNotificationProducer>();
builder.Services.AddOpenApi();

var postgresConnection = builder.Configuration.GetConnectionString("PostgreSQL")
    ?? throw new InvalidOperationException("ConnectionStrings:PostgreSQL is required.");

builder.Services.AddHealthChecks()
    .AddNpgSql(postgresConnection, name: "postgresql")
    .AddMongoDb(sp => sp.GetRequiredService<IMongoClient>(), name: "mongodb");

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    await app.Services.ApplyDatabaseMigrationsAsync();
}

app.UseCors();

app.UseAuthentication();

// A temporary password opens only "who am I", change password and sign out (IDN-01).
app.UsePasswordChangeGate();

// Map files (occupancy PGM/YAML and the preview PNG of the same occupancy) are warehouse layout data: they need a
// signed-in user with map.read (POL-04). <img> tags cannot send a header, so clients append ?access_token=.
app.UseWhen(
    context => context.Request.Path.StartsWithSegments(MapAssetsPath),
    branch => branch.Use(async (context, next) =>
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        if (!RolePermissionMatrix.UserHas(context.User, Permissions.MapRead))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }));

var mapAssetsRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "data", "maps"));
Directory.CreateDirectory(mapAssetsRoot);
var mapContentTypes = new FileExtensionContentTypeProvider();
mapContentTypes.Mappings[".pgm"] = "image/x-portable-graymap";
mapContentTypes.Mappings[".yaml"] = "text/yaml";
mapContentTypes.Mappings[".yml"] = "text/yaml";
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mapAssetsRoot),
    RequestPath = MapAssetsPath,
    ContentTypeProvider = mapContentTypes,
    // Per user, never in a shared cache.
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "private, max-age=300"
});

app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapHub<NotificationsHub>("/hubs/notifications", options =>
    // Ends the connection when its access token expires; the client reconnects with a fresh one (RTM-01).
    options.CloseOnAuthenticationExpiration = true);

app.MapIdentityEndpoints();
app.MapWarehouseEndpoints();
app.MapTransportationEndpoints();
app.MapWorkflowExecutionEndpoints();
app.MapFleetEndpoints();
app.MapNavigationEndpoints();
app.MapOperationsEndpoints();

app.Run();

public partial class Program
{
    private const string MapAssetsPath = "/map-assets";
}
