package desktoper

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/chtisgit/retro-desktop/api"
)

type Desktop struct {
	name        string
	path        string
	activeUsers int32
	opened      time.Time

	filesLock sync.Mutex
	state     api.Desktop

	msgLock sync.Mutex
	subs    []chan *api.WSResponse

	desktoper *Desktoper
}

func (d *Desktop) Files() (files []api.File) {
	d.filesLock.Lock()
	files = make([]api.File, len(d.state.Files))
	copy(files, d.state.Files)
	d.filesLock.Unlock()

	return
}

func (d *Desktop) CopyState() *api.Desktop {
	d.filesLock.Lock()
	state := d.state.Copy()
	d.filesLock.Unlock()

	return state
}

var ErrFileNotFound = errors.New("file not found")

type FileFunc func(file *api.File, index int)

func (d *Desktop) File(id string, f FileFunc) error {
	d.filesLock.Lock()

	for i := range d.state.Files {
		if d.state.Files[i].ID == id {
			f(&d.state.Files[i], i)

			d.filesLock.Unlock()

			return nil
		}
	}

	d.filesLock.Unlock()

	return ErrFileNotFound
}

func (d *Desktop) GetFile(id string) (f *api.File, err error) {
	err = d.File(id, func(file *api.File, _ int) {
		f = new(api.File)
		*f = *file
	})
	return
}

func checkCoords(x, y float64) bool {
	if math.IsNaN(x) || math.IsNaN(y) {
		return false
	}
	if math.IsInf(x, 0) || math.IsInf(y, 0) {
		return false
	}

	return x >= 0 && y >= 0 && x < 1920 && y < 1080
}

func randomStr(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}

	return base64.URLEncoding.EncodeToString(b)[:n], nil
}

func (d *Desktop) createDirectory(req *api.WSCreateDirectory) (res api.WSCreateDirectoryResponse, err error) {
	if req.Type != "subdesktop" {
		err = errors.New("unsupported directory type")
		return
	}

	sid, err := randomStr(10)
	if err != nil {
		return
	}

	subdesktop := d.name + "+" + sid
	err = d.desktoper.CreateDesktop(subdesktop)
	if err != nil {
		return
	}

	id, err := d.nextID()
	if err != nil {
		return
	}

	d.filesLock.Lock()
	defer d.filesLock.Unlock()

	now := time.Now()
	res = api.File{
		ID:   id,
		Name: req.Name,
		X:    req.X,
		Y:    req.Y,
		Directory: &api.DirInfo{
			Type:    req.Type,
			Desktop: subdesktop,
		},
		Created:  &now,
		Modified: &now,
	}

	d.state.Files = append(d.state.Files, res)

	return
}

func (d *Desktop) Request(req *api.WSRequest) (res *api.WSResponse) {
	switch req.Type {
	case "open":
		res = &api.WSResponse{
			Type:    req.Type,
			Desktop: d.name,
		}

		state := d.CopyState()
		res.Open.Files = state.Files

	case "create_directory":
		dir, err := d.createDirectory(&req.CreateDirectory)
		if err != nil {
			res = &api.WSResponse{
				Type:    "error",
				Desktop: d.name,
				Error: api.WSErrorResponse{
					Text: err.Error(),
				},
			}
			return
		}

		d.SendMessage(&api.WSResponse{
			Type:            req.Type,
			Desktop:         d.name,
			CreateDirectory: dir,
		})
	case "move":
		if !checkCoords(req.Move.ToX, req.Move.ToY) {
			res = &api.WSResponse{
				Type:    "error",
				Desktop: d.name,
				Error: api.WSErrorResponse{
					ID:   "coordinates-out-of-range",
					Text: "Coordinates out of range",
				},
			}
			return
		}

		if err := d.File(req.Move.ID, func(file *api.File, _ int) {
			file.X = req.Move.ToX
			file.Y = req.Move.ToY
		}); err != nil {
			// TODO: did we just assume the error?
			res = &api.WSResponse{
				Type:    "error",
				Desktop: d.name,
				Error: api.WSErrorResponse{
					ID:   "file-not-found",
					Text: "Cannot move file with id '" + req.Move.ID + "' because it does not exist",
				},
			}
			return
		}

		d.SendMessage(&api.WSResponse{
			Type:    req.Type,
			Desktop: d.name,
			Move:    req.Move,
		})
	case "delete_file":
		if err := d.File(req.DeleteFile.ID, func(_ *api.File, i int) {
			copy(d.state.Files[i:], d.state.Files[i+1:])
			d.state.Files = d.state.Files[:len(d.state.Files)-1]
		}); err != nil {
			// TODO: did we just assume the error?
			res = &api.WSResponse{
				Type:    "error",
				Desktop: d.name,
				Error: api.WSErrorResponse{
					ID:   "file-not-found",
					Text: "Cannot delete file with id '" + req.Move.ID + "' because it does not exist",
				},
			}
			return
		}

		d.SendMessage(&api.WSResponse{
			Type:       req.Type,
			Desktop:    d.name,
			DeleteFile: req.DeleteFile,
		})

	default:
		res = &api.WSResponse{
			Type:    "error",
			Desktop: d.name,
			Error: api.WSErrorResponse{
				ID:   "unkown-request-type",
				Text: "Unknown request type '" + req.Type + "'",
			},
		}
	}

	return
}

func (d *Desktop) SendMessage(msg *api.WSResponse) {
	// take snapshot of d.subs
	d.msgLock.Lock()
	subs := make([]chan *api.WSResponse, len(d.subs))
	copy(subs, d.subs)
	d.msgLock.Unlock()

	log.Printf("Send message (type %s) to %d receivers", msg.Type, len(d.subs))

	timeout := time.NewTimer(10 * time.Second)
	timeoutCh := make(chan struct{})
	go func() {
		<-timeout.C
		close(timeoutCh)
	}()

	for i := range subs {
		go func(sub chan<- *api.WSResponse) {
			select {
			case sub <- msg:
				break
			case <-timeoutCh:
				log.Println("Send timed out on channel after 10s")
			}
		}(subs[i])
	}

}

func (d *Desktop) createFile(name string, src io.ReadSeeker) error {
	f, err := os.OpenFile(filepath.Join(d.path, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	defer f.Close()

	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return err
	}

	_, err = io.Copy(f, src)

	return err
}

func (d *Desktop) nextID() (string, error) {
	if d.state.FileIDCtr == 16777215 {
		return "", errors.New("no more file IDs")
	}

	id := fmt.Sprintf("%06X", d.state.FileIDCtr)
	d.state.FileIDCtr++

	return id, nil
}

func (d *Desktop) assignDates() {
	for i := range d.state.Files {
		if d.state.Files[i].Created == nil {
			d.state.Files[i].Created = new(time.Time)
			*d.state.Files[i].Created = time.Now()
		}

		if d.state.Files[i].Modified == nil {
			d.state.Files[i].Modified = d.state.Files[i].Created
		}
	}

}

func (d *Desktop) assignFileIDs() error {
	var err error

	for i := range d.state.Files {
		if d.state.Files[i].ID == "" {
			path := filepath.Join(d.path, d.state.Files[i].Name)
			if _, err := os.Stat(path); err != nil {
				log.Printf("file %s not found \n", d.state.Files[i].Name)
				continue
			}

			d.state.Files[i].ID, err = d.nextID()
			if err != nil {
				return err
			}

			newPath := filepath.Join(d.path, d.state.Files[i].ID)

			err := os.Rename(path, newPath)
			if err != nil {
				log.Print("cannot rename file ", path, " to ", newPath)
				d.state.Files[i].ID = ""
			}
		}
	}

	for i := 0; i < len(d.state.Files); {
		if d.state.Files[i].ID == "" {
			copy(d.state.Files[i:], d.state.Files[i+1:])
			d.state.Files = d.state.Files[:len(d.state.Files)-1]
		} else {
			i++
		}
	}

	return nil
}

func (d *Desktop) HTTPUploadFile(w http.ResponseWriter, r *http.Request) {
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var x, y float64
	serverCoords := true
	x, err = strconv.ParseFloat(r.FormValue("x"), 64)
	if err == nil {
		y, err = strconv.ParseFloat(r.FormValue("y"), 64)
		if err == nil {
			serverCoords = false
		}
	}
	if serverCoords {
		x = float64(d.state.CreateX)
		y = float64(d.state.CreateY)
	}

	d.filesLock.Lock()
	defer d.filesLock.Unlock()

	if len(d.state.Files) >= 256 {
		http.Error(w, "The desktop is full", http.StatusInternalServerError)
		return
	}

	id := fmt.Sprintf("%06X", d.state.FileIDCtr)
	d.state.FileIDCtr++

	if err := d.createFile(id, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	now := time.Now()

	f := api.File{
		ID:       id,
		Name:     hdr.Filename,
		X:        x,
		Y:        y,
		Created:  &now,
		Modified: &now,
	}

	d.state.Files = append(d.state.Files, f)

	d.SendMessage(&api.WSResponse{
		Type:    "create_file",
		Desktop: d.name,
		CreateFile: api.WSCreateFileResponse{
			File: f,
		},
	})

	if serverCoords {
		d.state.CreateX += 64
		if d.state.CreateX >= 1920 {
			d.state.CreateX = 16
			d.state.CreateY += 96
		}
	}
}

func (d *Desktop) OpenFile(id string) (*os.File, *api.File, error) {
	info, err := d.GetFile(id)
	if err != nil {
		return nil, nil, err
	}

	f, err := os.Open(filepath.Join(d.path, info.ID))
	return f, info, err
}

func (d *Desktop) Messages() (ch chan *api.WSResponse, unsubscribe func()) {
	ch = make(chan *api.WSResponse, 1)

	d.msgLock.Lock()
	d.subs = append(d.subs, ch)
	d.msgLock.Unlock()

	unsubscribe = func() {
		d.msgLock.Lock()
		defer d.msgLock.Unlock()

		for i := range d.subs {
			if d.subs[i] == ch {
				d.subs[i] = nil
				copy(d.subs[i:], d.subs[i+1:])
				d.subs = d.subs[:len(d.subs)-1]
				break
			}
		}
	}

	return
}

func (d *Desktop) Close() error {
	d.desktoper.CloseDesktop(d.name)

	return nil
}
