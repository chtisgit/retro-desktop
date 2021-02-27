package desktoper

import (
	"io"
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
	files     []api.File

	msgLock sync.Mutex
	subs    []chan *api.WSResponse

	desktoper *Desktoper
}

func (d *Desktop) Files() (files []api.File) {
	d.filesLock.Lock()
	files = d.files
	d.filesLock.Unlock()

	return
}

func (d *Desktop) Request(req *api.WSRequest) (res api.WSResponse) {
	res.Type = req.Type

	switch req.Type {
	case "init":
		res.Init.Files = d.Files()
	default:
		res.Type = "error"
		res.Error.ID = "unkown-request-type"
		res.Error.Text = "Unknown request type"
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

	if err := d.createFile(hdr.Filename, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	d.SendMessage(&api.WSResponse{
		Type: "create_file",
		CreateFile: api.WSCreateFileResponse{
			Name: hdr.Filename,
			X:    0,
			Y:    0,
		},
	})
}

func (d *Desktop) OpenFile(name string) (*os.File, error) {
	return os.Open(filepath.Join(d.path, name))
}

func (d *Desktop) Messages() (ch chan *api.WSResponse, unsubscribe func()) {
	ch = make(chan *api.WSResponse)

	d.msgLock.Lock()
	defer d.msgLock.Unlock()

	d.subs = append(d.subs, ch)

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
