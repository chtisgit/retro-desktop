package main

import (
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/chtisgit/retro-waste/api"
	"github.com/chtisgit/retro-waste/internal/server"
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
	flag.Parse()

	if !checkDirs(c.SaveDir, c.WebRoot) {
		log.Fatalln("set -d and -webroot to existing directories")
	}

	s := server.New(c.SaveDir, c.WebRoot)
	log.Printf("starting...")

	err := http.ListenAndServe(c.Listen, s)
	if err != nil {
		log.Fatal("listen failed:", err)
	}
}
