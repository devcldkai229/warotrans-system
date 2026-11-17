# Build context: backend/  ->  docker build -f src/WaroTrans.Evidence/Worker/Dockerfile -t warotrans-evidence-worker .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/WaroTrans.BuildingBlocks/ src/WaroTrans.BuildingBlocks/
COPY src/WaroTrans.Evidence/ src/WaroTrans.Evidence/
RUN dotnet publish src/WaroTrans.Evidence/Worker/WaroTrans.Evidence.Worker.csproj -c Release -o /app --nologo

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# ffmpeg is only used by the dev-only Local media provider (Evidence__Media__Provider=Local); MediaConvert does not need it.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5096 \
    Evidence__Storage__LocalRoot=/data/evidence
VOLUME /data/evidence
EXPOSE 5096
USER $APP_UID
ENTRYPOINT ["dotnet", "WaroTrans.Evidence.Worker.dll"]
