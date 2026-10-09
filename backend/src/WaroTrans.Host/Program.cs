using System.Text;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Host.Extensions;
using WaroTrans.Host.Hubs;
using WaroTrans.Host.Realtime;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;

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

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var key = builder.Configuration["Authentication:Jwt:Key"] ?? "warotrans-dev-signing-key-change-me-32chars!";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(AuthorizationPolicies.AdminOnly, policy =>
        policy.RequireAuthenticatedUser().RequireRole("ADMIN"));
    options.AddPolicy(AuthorizationPolicies.StaffOrAdmin, policy =>
        policy.RequireAuthenticatedUser().RequireRole("ADMIN", "STAFF"));
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<IRobotRealtimeNotifier, SignalRRobotRealtimeNotifier>();
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
    app.MapOpenApi();
    await app.Services.ApplyDatabaseMigrationsAsync();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
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
