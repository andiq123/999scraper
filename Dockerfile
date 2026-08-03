FROM golang:1.26-alpine AS dependencies
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

FROM dependencies AS development
ARG AIR_VERSION=v1.65.1
RUN go install github.com/air-verse/air@${AIR_VERSION}
COPY .air.toml ./
COPY cmd/ cmd/
COPY internal/ internal/
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

FROM dependencies AS builder
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.24 AS production
RUN apk add --no-cache ca-certificates \
    && addgroup -S app \
    && adduser -S -G app app
WORKDIR /app
COPY --from=builder /server ./server
USER app
EXPOSE 8080
ENTRYPOINT ["./server"]
