# SMTP sending engine (MTA, DKIM, connection pooling).

FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /engine .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tini \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
COPY --from=builder /engine /usr/local/bin/engine
USER forgemsg
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/engine"]
