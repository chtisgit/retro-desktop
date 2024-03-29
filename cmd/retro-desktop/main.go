package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/chtisgit/retro-desktop/api"
	"github.com/chtisgit/retro-desktop/internal/server"
)

func checkDir(path string) bool {
	if path == "" {
		return false
	}

	st, err := os.Stat(path)
	return err == nil && st.IsDir()
}

func checkDirs(paths ...string) bool {
	for _, path := range paths {
		if !checkDir(path) {
			return false
		}
	}
	return true
}

func main() {
	var c api.Config

	flag.StringVar(&c.Listen, "listen", ":8080", "listen address, host and port combination")
	flag.StringVar(&c.SaveDir, "d", "", "saves directory")
	flag.StringVar(&c.WebRoot, "webroot", "", "web root")
	flag.Int64Var(&c.UploadBandwidthLimit, "upload-bw", 0, "Upload bandwidth limit in [kB/s]")
	flag.Parse()

	if !checkDirs(c.SaveDir, c.WebRoot) {
		log.Fatalln("fatal error: set -d and -webroot to existing directories")
	}

	s := server.New(&c)

	srv := http.Server{
		Addr:    c.Listen,
		Handler: s,
	}

	sigs := make(chan os.Signal, 1)

	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	shutdown := make(chan struct{})

	go func() {
		<-sigs
		log.Println("app: signal received")

		close(shutdown)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		s.StopWebsockets()

		if err := srv.Shutdown(ctx); err != nil {
			srv.Close()
		}

	}()

	go func() {
		t := time.NewTicker(5 * time.Minute)

		for {
			select {
			case <-shutdown:
				return
			case <-t.C:
			}
			s.LogStatus()
		}
	}()

	log.Println("ready")
	err := srv.ListenAndServe()
	if err != nil {
		if err == http.ErrServerClosed {
			log.Print("app: shutdown")
		} else {
			log.Fatal("app: listen failed: ", err)
		}
	}
}
