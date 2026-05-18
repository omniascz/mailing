# SMPP v3.4 SMS gateway.

FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /sms-gateway .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tini \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
COPY --from=builder /sms-gateway /usr/local/bin/sms-gateway
USER forgemsg
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/sms-gateway"]
