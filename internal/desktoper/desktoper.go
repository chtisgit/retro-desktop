package desktoper

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/chtisgit/retro-waste/api"
)

// Desktoper manages active desktops
type Desktoper struct {
	path string

	mLock sync.Mutex
	m     map[string]*Desktop
}

func New(path string) *Desktoper {
	if err := os.MkdirAll(path, 0700); err != nil && !os.IsExist(err) {
		panic(err)
	}

	return &Desktoper{
		path: path,
		m:    make(map[string]*Desktop),
	}
}

func (d *Desktoper) newDesktop(name string) *Desktop {
	dt := &Desktop{
		name:      name,
		path:      filepath.Join(d.path, name),
		desktoper: d,
		files: []api.File{
			{Name: "README.TXT", X: 16, Y: 16},
			{Name: "porn.mp4", X: 105, Y: 32},
		},
	}

	if err := os.Mkdir(dt.path, 0700); err != nil && !os.IsExist(err) {
		panic(err)
	}

	return dt
}

func (d *Desktoper) OpenDesktop(name string) (*Desktop, error) {
	d.mLock.Lock()
	defer d.mLock.Unlock()

	dt, ok := d.m[name]
	if !ok {
		dt = d.newDesktop(name)
		d.m[name] = dt
	}

	atomic.AddInt32(&d.newDesktop(name).activeUsers, 1)

	return dt, nil
}

func (d *Desktoper) CloseDesktop(name string) error {
	d.mLock.Lock()
	defer d.mLock.Unlock()

	dt, ok := d.m[name]
	if !ok {
		return errors.New("not found")
	}

	if atomic.LoadInt32(&dt.activeUsers) == 0 {
		// TODO: delete desktop

	}

	return nil
}
