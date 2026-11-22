namespace WaroTrans.Host.Extensions;

/// <summary>
/// In AWS the browser talks HTTPS to CloudFront and CloudFront talks HTTP to the ALB, so the request reaches the Host
/// as <c>http</c> (X-Forwarded-Proto from the ALB says http too). The refresh cookie is <c>Secure</c> only on HTTPS
/// requests, so with <c>ReverseProxy:TrustCloudFrontProto=true</c> the scheme is taken from CloudFront's
/// <c>CloudFront-Forwarded-Proto</c> header. Only switch it on behind an ALB that admits CloudFront alone (origin
/// prefix list + secret origin header): anyone else could otherwise claim HTTPS.
/// </summary>
public static class CloudFrontSchemeExtensions
{
    public const string HeaderName = "CloudFront-Forwarded-Proto";

    public static IApplicationBuilder UseCloudFrontScheme(this WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("ReverseProxy:TrustCloudFrontProto"))
        {
            return app;
        }

        return app.Use((context, next) =>
        {
            var proto = context.Request.Headers[HeaderName].ToString();
            if (proto is "https" or "http")
            {
                context.Request.Scheme = proto;
            }

            return next(context);
        });
    }
}
