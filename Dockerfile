FROM mcr.microsoft.com/dotnet/sdk:6.0 AS build-env
WORKDIR /app

COPY ["*.sln", "./"]
COPY ["API/*.csproj", "./API/"]
COPY ["Infrastructure/*.csproj", "./Infrastructure/"]
COPY ["Core/*.csproj", "./Core/"]

RUN dotnet restore "999Scrapper.sln"
COPY . .

RUN dotnet publish "999Scrapper.sln" -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:6.0
WORKDIR /app
COPY --from=build-env /app/out .
ENTRYPOINT ["dotnet", "API.dll"]