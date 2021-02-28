package desktoper

import (
	"encoding/json"
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
		state: api.Desktop{
			CreateX: 16,
			CreateY: 16,
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

		f, err := os.Open(filepath.Join(d.path, name+".json"))
		if err == nil {
			if err := json.NewDecoder(f).Decode(&dt.state); err != nil {
				f.Close()
				os.Remove(f.Name())
			} else {
				f.Close()
			}
		}
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

	n := atomic.LoadInt32(&dt.activeUsers)
	if n == 0 {
		f, err := os.Create(filepath.Join(d.path, name+".json"))
		if err != nil {
			return err
		}

		err = json.NewEncoder(f).Encode(dt.state)
		f.Close()

		delete(d.m, name)

		return err
	}

	return nil
}
