# Build context: backend/  ->  docker build -f src/WaroTrans.Evidence/Worker/Dockerfile -t warotrans-evidence-worker .
# AWS (MediaConvert, linux/arm64):  docker buildx build --platform linux/arm64 --target runtime ...
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
COPY src/WaroTrans.BuildingBlocks/ src/WaroTrans.BuildingBlocks/
COPY src/WaroTrans.Evidence/ src/WaroTrans.Evidence/
RUN dotnet publish src/WaroTrans.Evidence/Worker/WaroTrans.Evidence.Worker.csproj -c Release -a $TARGETARCH -o /app --nologo

# MediaConvert transcodes: no ffmpeg, and no RUN, so it cross-builds for arm64 without emulation.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5096 \
    Evidence__Storage__LocalRoot=/data/evidence
VOLUME /data/evidence
EXPOSE 5096
USER $APP_UID
ENTRYPOINT ["dotnet", "WaroTrans.Evidence.Worker.dll"]

# Default target (docker compose): ffmpeg for the dev-only Local media provider (Evidence__Media__Provider=Local).
FROM runtime AS runtime-ffmpeg
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
USER $APP_UID
