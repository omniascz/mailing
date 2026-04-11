FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /sms-gateway .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /sms-gateway /sms-gateway
ENTRYPOINT ["/sms-gateway"]
