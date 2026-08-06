FROM golang:1.26.5-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG GO_BUILD_TAGS
ARG APP_VERSION=development
RUN CGO_ENABLED=0 GOOS=linux go build -tags="${GO_BUILD_TAGS}" -trimpath -ldflags="-s -w" -o /out/zoomigo-api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" -o /out/zoomigo-backup ./cmd/backup
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/zoomigo-admin ./cmd/admin

FROM build AS test

FROM alpine:3.22 AS runtime

COPY --from=build /out/zoomigo-api /zoomigo-api
COPY --from=build /out/zoomigo-backup /zoomigo-backup
COPY --from=build /out/zoomigo-admin /zoomigo-admin
RUN mkdir /data && chown 65532:65532 /data
USER 65532:65532
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/zoomigo-api"]
