package server

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"reflect"
	"sync"

	"github.com/chtisgit/retro-desktop/api"
	"github.com/chtisgit/retro-desktop/internal/desktoper"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

type Server struct {
	m   *mux.Router
	upg websocket.Upgrader

	desktoper *desktoper.Desktoper

	webroot string

	wsClose chan struct{}
	wsWait  sync.WaitGroup
}

// Server implements http.Handler
var _ http.Handler = (*Server)(nil)

func New(dir, webroot string) (s *Server) {
	s = &Server{
		m:         mux.NewRouter(),
		webroot:   webroot,
		desktoper: desktoper.New(dir),
		wsClose:   make(chan struct{}),
	}

	s.m.Path("/").HandlerFunc(s.root)
	s.m.Path("/d/{desktop:[A-Za-z0-9_-]+}").HandlerFunc(s.desktop)
	s.m.PathPrefix("/assets/").Handler(http.FileServer(http.Dir(s.webroot)))

	s.m.Path("/api/ws").HandlerFunc(s.ws)
	s.m.Path("/api/desktop/{desktop}/file").HandlerFunc(s.fileUpload).Methods(http.MethodPost)
	s.m.Path("/api/desktop/{desktop}/file/{file}/download").HandlerFunc(s.fileDownload).Methods(http.MethodGet, http.MethodOptions)
	s.m.Path("/api/desktop/{desktop}/file/{file}/content").HandlerFunc(s.fileContent).Methods(http.MethodGet, http.MethodOptions)

	return
}

func (s *Server) StopWebsockets() {
	close(s.wsClose)
	s.wsWait.Wait()
}

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	select {
	case <-s.wsClose:
		http.Error(w, "Server shutting down", http.StatusInternalServerError)
		return
	default:
		break
	}

	s.wsWait.Add(1)
	defer s.wsWait.Done()

	desktops := make(map[string]*desktoper.Desktop)
	defer func() {
		for _, dt := range desktops {
			dt.Close()
		}
	}()

	log.Print("ws request: ", r.RequestURI)

	c, err := s.upg.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws: upgrade error:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer c.Close()

	log.Print("ws opened by ", c.RemoteAddr())

	reqs := make(chan api.WSRequest, 1)
	go func(reqs chan<- api.WSRequest) {
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

			select {
			case reqs <- req:
				break
			case <-s.wsClose:
				close(reqs)
				return
			}
		}
	}(reqs)

	subber := desktoper.NewSubscriber()
	defer subber.UnsubscribeAll()

	reqsCase := reflect.SelectCase{
		Dir:  reflect.SelectRecv,
		Chan: reflect.ValueOf(reqs),
	}
	wsCloseCase := reflect.SelectCase{
		Dir:  reflect.SelectRecv,
		Chan: reflect.ValueOf(s.wsClose),
	}

wsloop:
	for {
		channels := append(subber.Messages(), reqsCase, wsCloseCase)
		chosen, recv, more := reflect.Select(channels)
		if !more {
			channels[chosen].Chan = reflect.Zero(reflect.TypeOf(channels[chosen].Chan))
		}

		if chosen < len(channels)-2 { // a desktop message channel
			if !more {
				log.Printf("ws: error: msgs closed unexpectedly")
				break wsloop
			}

			// forward a message that is emitted on a desktop to the frontend

			msg := recv.Interface().(*api.WSResponse)

			if err := c.WriteJSON(msg); err != nil {
				log.Println("ws: write error: ", err)
				break wsloop
			}

		} else if chosen == len(channels)-2 { // reqs channel
			if !more {
				log.Printf("ws: error: reqs closed unexpectedly")
				break wsloop
			}

			req := recv.Interface().(api.WSRequest)

			// process requests from the frontend
			switch req.Type {
			case "ping":
				if err := c.WriteJSON(api.WSResponse{
					Type: "ping",
				}); err != nil {
					log.Println("ws: write error: ", err)
					break wsloop
				}

			case "open":
				if err := subber.Subscribe(s.desktoper, req.Desktop); err != nil {
					// TODO: send error
					log.Println("ws: error: cannot open desktop")
					break
				}

				fallthrough
			default:
				// pass the request to the specified desktop

				dt, err := subber.Desktop(req.Desktop)
				if err != nil {
					// TODO: send error
					log.Print("ws: error: request for desktop that is not open")
					break
				}

				res := dt.Request(&req)
				if res == nil {
					break
				}
				if err := c.WriteJSON(res); err != nil {
					log.Println("ws: write error: ", err)
					break wsloop
				}
			}

		} else if chosen == len(channels)-1 { // wsClose channel
			log.Println("wsClose closed")
			break wsloop
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
	dt.Close()
}

func (s *Server) dl(w http.ResponseWriter, r *http.Request, attachment bool) {
	v := mux.Vars(r)
	id, ok := v["desktop"]
	fileID, ok2 := v["file"]
	if !ok || !ok2 {
		http.NotFound(w, r)
		return
	}

	dt, err := s.desktoper.OpenDesktop(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer dt.Close()

	f, info, err := dt.OpenFile(fileID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	defer f.Close()

	if attachment {
		w.Header().Add("Content-Disposition", "attachment; filename=\""+info.Name+"\"")
	}

	http.ServeContent(w, r, "", *info.Modified, f)
}

func (s *Server) fileDownload(w http.ResponseWriter, r *http.Request) {
	log.Println("fileDownload")
	s.dl(w, r, true)
}

func (s *Server) fileContent(w http.ResponseWriter, r *http.Request) {
	log.Println("fileContent")
	s.dl(w, r, false)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("request uri: %s", r.RequestURI)

	s.m.ServeHTTP(w, r)

}

func (s *Server) LogStatus() {
	st := s.desktoper.Status()
	if len(st) == 0 {
		return
	}

	log.Printf("status: We have %d open desktops atm", len(st))
	for i, line := range st {
		log.Printf("status: [%2d] %s", i, line)
	}
}
