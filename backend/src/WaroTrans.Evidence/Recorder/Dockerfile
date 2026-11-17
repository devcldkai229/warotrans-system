# Build context: backend/  ->  docker build -f src/WaroTrans.Evidence/Recorder/Dockerfile -t warotrans-evidence-recorder .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/WaroTrans.BuildingBlocks/ src/WaroTrans.BuildingBlocks/
COPY src/WaroTrans.Evidence/ src/WaroTrans.Evidence/
RUN dotnet publish src/WaroTrans.Evidence/Recorder/WaroTrans.Evidence.Recorder.csproj -c Release -o /app --nologo

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:5095 \
    Evidence__Storage__LocalRoot=/data/evidence
VOLUME /data/evidence
EXPOSE 5095
USER $APP_UID
ENTRYPOINT ["dotnet", "WaroTrans.Evidence.Recorder.dll"]
