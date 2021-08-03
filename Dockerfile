FROM mcr.microsoft.com/dotnet/aspnet:latest AS base
WORKDIR /app
EXPOSE 5000

# # Creates a non-root user with an explicit UID and adds permission to access the /app folder
# # For more info, please refer to https://aka.ms/vscode-docker-dotnet-configure-containers
# RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
# USER appuser

FROM mcr.microsoft.com/dotnet/sdk:latest AS build
WORKDIR /src
COPY ["*.sln", "./"]
COPY ["API/*.csproj", "./API/"]
COPY ["Infrastructure/*.csproj", "./Infrastructure/"]
COPY ["Core/*.csproj", "./Core/"]
RUN dotnet restore "999Scrapper.sln"
COPY . .
WORKDIR "/src/."
RUN dotnet build "999Scrapper.sln" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "999Scrapper.sln" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "API.dll"]