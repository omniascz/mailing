// Package server provides the gRPC transport layer for the MTA engine.
package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"

	"github.com/forgemsg/engine/internal/dkim"
	"github.com/forgemsg/engine/internal/pool"
	smtpsend "github.com/forgemsg/engine/internal/smtp"
	pb "github.com/forgemsg/engine/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// MTAServer implements the gRPC MTAService.
type MTAServer struct {
	pb.UnimplementedMTAServiceServer
	sender  *smtpsend.Sender
	pool    *pool.Pool
	version string
}

// New creates a new MTAServer.
func New(p *pool.Pool, version string) *MTAServer {
	return &MTAServer{
		sender:  smtpsend.NewSender(p),
		pool:    p,
		version: version,
	}
}

// Send handles a single email send request.
func (s *MTAServer) Send(_ context.Context, req *pb.SendRequest) (*pb.SendResponse, error) {
	msg := requestToMessage(req)
	result := s.sender.Send(msg)

	return &pb.SendResponse{
		Success:     result.Success,
		MessageId:   result.MessageID,
		SmtpCode:    int32(result.SMTPCode),
		SmtpMessage: result.SMTPMessage,
		Error:       result.Error,
		DurationMs:  result.DurationMs,
	}, nil
}

// SendBatch handles batch email sending.
func (s *MTAServer) SendBatch(_ context.Context, req *pb.SendBatchRequest) (*pb.SendBatchResponse, error) {
	results := make([]*pb.SendResponse, len(req.Messages))
	var totalSent, totalFailed int32

	// Process in parallel with bounded concurrency
	const maxConcurrency = 20
	sem := make(chan struct{}, maxConcurrency)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i, r := range req.Messages {
		wg.Add(1)
		sem <- struct{}{} // acquire semaphore

		go func(idx int, sendReq *pb.SendRequest) {
			defer wg.Done()
			defer func() { <-sem }() // release semaphore

			msg := requestToMessage(sendReq)
			result := s.sender.Send(msg)

			resp := &pb.SendResponse{
				Success:     result.Success,
				MessageId:   result.MessageID,
				SmtpCode:    int32(result.SMTPCode),
				SmtpMessage: result.SMTPMessage,
				Error:       result.Error,
				DurationMs:  result.DurationMs,
			}

			mu.Lock()
			results[idx] = resp
			if result.Success {
				totalSent++
			} else {
				totalFailed++
			}
			mu.Unlock()
		}(i, r)
	}

	wg.Wait()

	return &pb.SendBatchResponse{
		Results:     results,
		TotalSent:   totalSent,
		TotalFailed: totalFailed,
	}, nil
}

// HealthCheck returns the current health status.
func (s *MTAServer) HealthCheck(_ context.Context, _ *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	activeConns, poolSize := s.pool.Stats()
	return &pb.HealthCheckResponse{
		Healthy:           true,
		ActiveConnections: int32(activeConns),
		PoolSize:          int32(poolSize),
		Version:           s.version,
	}, nil
}

// ListenAndServe starts the gRPC server on the given address.
func (s *MTAServer) ListenAndServe(addr string) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("grpc: listen %s: %w", addr, err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterMTAServiceServer(grpcServer, s)
	reflection.Register(grpcServer) // for grpcurl / debugging

	log.Printf("MTA gRPC server listening on %s", addr)
	return grpcServer.Serve(lis)
}

func requestToMessage(req *pb.SendRequest) *smtpsend.Message {
	msg := &smtpsend.Message{
		MessageID: req.MessageId,
		FromEmail: req.FromEmail,
		FromName:  req.FromName,
		ToEmail:   req.ToEmail,
		ToName:    req.ToName,
		Subject:   req.Subject,
		HTMLBody:  req.HtmlBody,
		TextBody:  req.TextBody,
		ReplyTo:   req.ReplyTo,
		Headers:   req.CustomHeaders,
		SendingIP: req.SendingIp,
	}

	if req.Dkim != nil {
		msg.DkimConfig = &dkim.SignConfig{
			Domain:        req.Dkim.Domain,
			Selector:      req.Dkim.Selector,
			PrivateKeyPEM: req.Dkim.PrivateKeyPem,
		}
	}

	return msg
}
