using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>
/// The one way WaroTrans processes validate the access token Identity issues: the Host and the Evidence Recorder accept
/// the same tokens, so a signed-in user is signed in on both.
/// </summary>
public static class JwtAuthenticationExtensions
{
    /// <param name="acceptsQueryToken">
    /// Paths whose clients cannot set the Authorization header (WebSocket, &lt;img&gt;, HLS players) and send
    /// <c>?access_token=</c> instead. Null: header only.
    /// </param>
    public static IServiceCollection AddWaroTransJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        Func<HttpContext, bool>? acceptsQueryToken = null)
    {
        var jwtOptions = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
        if (Encoding.UTF8.GetByteCount(jwtOptions.Key) < JwtOptions.MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                $"{JwtOptions.SectionName}:Key is required and must be at least {JwtOptions.MinimumKeyBytes} bytes.");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
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
                if (acceptsQueryToken is not null)
                {
                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            var accessToken = context.Request.Query["access_token"];
                            if (!string.IsNullOrEmpty(accessToken) && acceptsQueryToken(context.HttpContext))
                            {
                                context.Token = accessToken;
                            }

                            return Task.CompletedTask;
                        }
                    };
                }
            });
        return services;
    }
}
