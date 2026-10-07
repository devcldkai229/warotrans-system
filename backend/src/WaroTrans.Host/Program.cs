using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet;
using WaroTrans.Host.Extensions;
using WaroTrans.Host.Hubs;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;

var builder = WebApplication.CreateBuilder(args);

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
            // Browsers cannot set the Authorization header on WebSocket requests, so SignalR sends the token here.
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
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
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapHub<NotificationsHub>("/hubs/notifications");

app.MapIdentityEndpoints();
app.MapWarehouseEndpoints();
app.MapTransportationEndpoints();
app.MapWorkflowExecutionEndpoints();
app.MapFleetEndpoints();
app.MapNavigationEndpoints();
app.MapOperationsEndpoints();

app.Run();

public partial class Program;
