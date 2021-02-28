package server

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/chtisgit/retro-waste/api"
	"github.com/chtisgit/retro-waste/internal/desktoper"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

type Server struct {
	m   *mux.Router
	upg websocket.Upgrader

	desktoper *desktoper.Desktoper

	webroot string
}

// Server implements http.Handler
var _ http.Handler = (*Server)(nil)

func New(dir, webroot string) (s *Server) {
	s = &Server{
		m:         mux.NewRouter(),
		webroot:   webroot,
		desktoper: desktoper.New(dir),
	}

	s.m.Path("/").HandlerFunc(s.root)
	s.m.Path("/d/{desktop:[A-Za-z0-9_-]+}").HandlerFunc(s.desktop)
	s.m.PathPrefix("/assets/").Handler(http.FileServer(http.Dir(s.webroot)))

	s.m.Path("/api/desktop/{desktop}/ws").HandlerFunc(s.ws)
	s.m.Path("/api/desktop/{desktop}/file").HandlerFunc(s.fileUpload).Methods(http.MethodPost)
	s.m.Path("/api/desktop/{desktop}/file/{file}").HandlerFunc(s.fileDownload).Methods(http.MethodGet, http.MethodOptions)

	return
}

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	v := mux.Vars(r)
	id, ok := v["desktop"]
	if !ok {
		http.NotFound(w, r)
		return
	}

	dt, err := s.desktoper.OpenDesktop(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer dt.Close()

	log.Print("ws request: ", r.RequestURI)
	c, err := s.upg.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws: upgrade error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	defer c.Close()

	reqs := make(chan api.WSRequest, 1)
	msgs, unsub := dt.Messages()
	defer unsub()

	go func() {
		for {
			var req api.WSRequest
			t, p, err := c.ReadMessage()
			if err != nil {
				log.Println("ws: read error:", err)
				close(reqs)
				return
			}
			if t != websocket.TextMessage {
				log.Println("ws: non-text messsage received unexpectedly. ignoring.")
				continue
			}

			if err := json.NewDecoder(bytes.NewReader(p)).Decode(&req); err != nil {
				log.Println("ws: json decode error: ", err)
				continue
			}

			reqs <- req
		}
	}()

wsloop:
	for {
		select {
		case req, more := <-reqs:
			if !more {
				log.Printf("ws: error: reqs closed unexpectedly")
				reqs = nil
				break wsloop
			}

			res := dt.Request(&req)
			if err := c.WriteJSON(res); err != nil {
				log.Println("ws: write error: ", err)
				break wsloop
			}
		case msg, more := <-msgs:
			if !more {
				log.Printf("ws: error: msgs closed unexpectedly")
				msgs = nil
				break wsloop
			}
			if err := c.WriteJSON(msg); err != nil {
				log.Println("ws: write error: ", err)
				break wsloop
			}
		}
	}

	log.Println("ws closed")
}

func (s *Server) root(w http.ResponseWriter, r *http.Request) {
	var b [6]byte

	if _, err := rand.Read(b[:]); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id := base64.URLEncoding.EncodeToString(b[:])

	http.Redirect(w, r, "/d/"+id, http.StatusTemporaryRedirect)
}

func (s *Server) desktop(w http.ResponseWriter, r *http.Request) {
	v := mux.Vars(r)
	id, ok := v["desktop"]
	if !ok {
		http.NotFound(w, r)
		return
	}

	log.Printf("desktop %s", id)

	http.ServeFile(w, r, filepath.Join(s.webroot, "index.html"))
}

func (s *Server) fileUpload(w http.ResponseWriter, r *http.Request) {
	v := mux.Vars(r)
	id, ok := v["desktop"]
	if !ok {
		http.NotFound(w, r)
		return
	}

	dt, err := s.desktoper.OpenDesktop(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	dt.HTTPUploadFile(w, r)
}

func (s *Server) fileDownload(w http.ResponseWriter, r *http.Request) {
	log.Println("fileDownload")

	v := mux.Vars(r)
	id, ok := v["desktop"]
	filename, ok2 := v["file"]
	if !ok || !ok2 {
		http.NotFound(w, r)
		return
	}

	dt, err := s.desktoper.OpenDesktop(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	f, err := dt.OpenFile(filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	defer f.Close()

	w.Header().Add("Content-Disposition", "attachment; filename=\""+filename+"\"")

	// FIXME: modtime
	http.ServeContent(w, r, "", time.Now(), f)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("request uri: %s", r.RequestURI)

	s.m.ServeHTTP(w, r)

}
