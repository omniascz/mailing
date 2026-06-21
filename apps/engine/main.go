package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/forgemsg/engine/internal/config"
	"github.com/forgemsg/engine/internal/inbound"
	"github.com/forgemsg/engine/internal/pool"
	"github.com/forgemsg/engine/internal/server"
	"github.com/forgemsg/engine/internal/warmup"
)

const version = "0.1.0"

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("ForgeMsg MTA Engine v%s starting...", version)

	cfg := config.Load()

	// Create connection pool
	connPool := pool.New(pool.Config{
		MaxConnsPerDomain: cfg.PoolMaxConnsPerDomain,
		IdleTimeout:       cfg.PoolIdleTimeout,
		ConnectTimeout:    cfg.SMTPConnectTimeout,
		ReadTimeout:       cfg.SMTPReadTimeout,
		WriteTimeout:      cfg.SMTPWriteTimeout,
		PreferStartTLS:    cfg.TLSPreferred,
	})
	defer connPool.Close()

	// Optional IP warmup enforcement.
	// Enabled when REDIS_URL + SENDING_IPS are both configured.
	warmupMgr, err := warmup.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("warmup: %v", err)
	}
	defer warmupMgr.Close()
	if warmupMgr != nil && len(cfg.SendingIPs) > 0 {
		log.Printf("IP warmup enforcement enabled for %d IPs: %v", len(cfg.SendingIPs), cfg.SendingIPs)
	}

	// Start gRPC server
	srv := server.New(connPool, warmupMgr, cfg.SendingIPs, version)

	go func() {
		if err := srv.ListenAndServe(cfg.GRPCAddr); err != nil {
			log.Fatalf("gRPC server error: %v", err)
		}
	}()

	// Optional MX-side inbound receiver. Disabled when INBOUND_LISTEN is unset.
	if addr := os.Getenv("INBOUND_LISTEN"); addr != "" {
		rcv := inbound.New(inbound.Config{
			ListenAddr: addr,
			Hostname:   os.Getenv("INBOUND_HOSTNAME"),
			APIURL:     os.Getenv("INBOUND_API_URL"),
			APISecret:  os.Getenv("INBOUND_API_SECRET"),
		})
		go func() {
			if err := rcv.ListenAndServe(); err != nil {
				log.Printf("inbound receiver stopped: %v", err)
			}
		}()
	}

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received %s, shutting down...", sig)
	connPool.Close()
	log.Println("MTA Engine stopped.")
}
