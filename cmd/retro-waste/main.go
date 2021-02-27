package main

import (
	"log"
	"net/http"

	"github.com/chtisgit/retro-waste/internal/server"
)

func main() {
	s := server.New()
	log.Printf("starting...")

	err := http.ListenAndServe(":8080", s)
	if err != nil {
		log.Fatal("listen failed:", err)
	}
}
