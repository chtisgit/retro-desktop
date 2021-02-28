package desktoper

import (
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/chtisgit/retro-waste/api"
)

type Desktop struct {
	name        string
	path        string
	activeUsers int32

	filesLock sync.Mutex
	state     api.Desktop

	msgLock sync.Mutex
	subs    []chan *api.WSResponse

	desktoper *Desktoper
}

func (d *Desktop) Files() (files []api.File) {
	d.filesLock.Lock()
	files = d.state.Files
	d.filesLock.Unlock()

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

func (d *Desktop) Request(req *api.WSRequest) (res api.WSResponse) {
	res.Type = req.Type

	switch req.Type {
	case "init":
		res.Init.Files = d.Files()
	case "move":
		if !checkCoords(req.Move.ToX, req.Move.ToY) {
			res.Type = "error"
			res.Error.ID = "coordinates-out-of-range"
			res.Error.Text = "Coordinates out of range"
			return
		}

		d.filesLock.Lock()

		found := false
		for i := range d.state.Files {
			if d.state.Files[i].Name == req.Move.Name {
				res.Move = req.Move
				d.state.Files[i].X = req.Move.ToX
				d.state.Files[i].Y = req.Move.ToY
				found = true
				break
			}
		}

		d.filesLock.Unlock()

		if !found {
			res.Type = "error"
			res.Error.ID = "file-not-found"
			res.Error.Text = "Cannot move file '" + req.Move.Name + "' because it does not exist"
			return
		}

		d.SendMessage(&res)

	default:
		res.Type = "error"
		res.Error.ID = "unkown-request-type"
		res.Error.Text = "Unknown request type '" + req.Type + "'"
	}

	return
}

func (d *Desktop) SendMessage(msg *api.WSResponse) {
	d.msgLock.Lock()

	for i := range d.subs {
		d.subs[i] <- msg
	}

	d.msgLock.Unlock()
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

func (d *Desktop) HTTPUploadFile(w http.ResponseWriter, r *http.Request) {
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	d.filesLock.Lock()
	defer d.filesLock.Unlock()

	if len(d.state.Files) >= 256 {
		http.Error(w, "The desktop is full", http.StatusInternalServerError)
		return
	}

	if err := d.createFile(hdr.Filename, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	d.state.Files = append(d.state.Files, api.File{
		Name: hdr.Filename,
		X:    float64(d.state.CreateX),
		Y:    float64(d.state.CreateY),
	})

	d.SendMessage(&api.WSResponse{
		Type: "create_file",
		CreateFile: api.WSCreateFileResponse{
			Name: hdr.Filename,
			X:    float64(d.state.CreateX),
			Y:    float64(d.state.CreateY),
		},
	})

	d.state.CreateX += 64
	if d.state.CreateX >= 1920 {
		d.state.CreateX = 16
		d.state.CreateY += 96
	}
}

func (d *Desktop) OpenFile(name string) (*os.File, error) {
	return os.Open(filepath.Join(d.path, name))
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

		// drain channel
		for {
			select {
			case <-ch:
			default:
				return
			}
		}
	}

	return
}

func (d *Desktop) Close() error {
	d.desktoper.CloseDesktop(d.name)

	return nil
}
