using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Features.ChangeAccountStatus;
using WaroTrans.Identity.Features.CreateAccount;
using WaroTrans.Identity.Features.GetCurrentAccount;
using WaroTrans.Identity.Features.ListAccounts;
using WaroTrans.Identity.Features.Login;
using WaroTrans.Identity.Features.Logout;
using WaroTrans.Identity.Features.RefreshSession;
using WaroTrans.Identity.Features.UpdateAccount;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity;

public static class IdentityModule
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<IdentityDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddSingleton<IPasswordHasher<Account>, PasswordHasher<Account>>();
        services.AddSingleton<TokenIssuer>();
        services.AddScoped<IdentityDevelopmentSeeder>();

        services.AddScoped<IValidator<LoginRequest>, LoginValidator>();
        services.AddScoped<LoginHandler>();
        services.AddScoped<RefreshSessionHandler>();
        services.AddScoped<LogoutHandler>();
        services.AddScoped<GetCurrentAccountHandler>();
        services.AddScoped<ListAccountsHandler>();

        services.AddScoped<IValidator<CreateAccountRequest>, CreateAccountValidator>();
        services.AddScoped<CreateAccountHandler>();
        services.AddScoped<IValidator<UpdateAccountRequest>, UpdateAccountValidator>();
        services.AddScoped<UpdateAccountHandler>();
        services.AddScoped<IValidator<ChangeAccountStatusRequest>, ChangeAccountStatusValidator>();
        services.AddScoped<ChangeAccountStatusHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/identity");
        group.MapGet("/ping", () => Results.Ok(new { module = "identity" })).AllowAnonymous();

        group.MapLogin();
        group.MapRefreshSession();
        group.MapLogout();
        group.MapGetCurrentAccount();
        group.MapListAccounts();
        group.MapCreateAccount();
        group.MapUpdateAccount();
        group.MapChangeAccountStatus();

        return endpoints;
    }

    /// <summary>Inserts the Development accounts if they are missing. The Host calls this in Development only.</summary>
    public static Task SeedIdentityDevelopmentDataAsync(
        this IServiceProvider scopedServices,
        CancellationToken cancellationToken = default) =>
        scopedServices.GetRequiredService<IdentityDevelopmentSeeder>().SeedAsync(cancellationToken);
}
