FROM golang:1.26.5-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/stridecrew-api ./cmd/api

FROM scratch

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/stridecrew-api /stridecrew-api
USER 65532:65532
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/stridecrew-api"]
