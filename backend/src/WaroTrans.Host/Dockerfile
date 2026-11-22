# Build context: backend/  ->  docker build -f src/WaroTrans.Host/Dockerfile -t warotrans-system .
# Multi-arch base images: `docker buildx build --platform linux/arm64` gives the image the AWS ECS (t4g) nodes run.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
COPY src/ src/
RUN dotnet publish src/WaroTrans.Host/WaroTrans.Host.csproj -c Release -a $TARGETARCH -o /app --nologo \
    && rm -rf /app/data && mkdir -p /out/data/maps

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# The Host serves /map-assets from ./data/maps and creates the folder at start; the app user (1654 = $APP_UID of the
# .NET images) cannot write /app. No RUN in this stage: it cross-builds for arm64 without emulation.
COPY --from=build --chown=1654:1654 /out/data /app/data
ENV ASPNETCORE_URLS=http://+:5090 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 5090
USER $APP_UID
# `--migrate` (ECS one-off task): apply every migration and the MongoDB indexes, then exit.
ENTRYPOINT ["dotnet", "WaroTrans.Host.dll"]
