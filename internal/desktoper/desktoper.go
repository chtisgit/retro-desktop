package desktoper

import (
	"encoding/json"
	"errors"
	"log"
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

	log.Printf("Open Desktop %s\n", name)
	dt, ok := d.m[name]
	if !ok {
		log.Printf("Not loaded. Load")
		dt = d.newDesktop(name)
		d.m[name] = dt

		f, err := os.Open(filepath.Join(d.path, name+".json"))
		if err == nil {
			if err := json.NewDecoder(f).Decode(&dt.state); err != nil {
				f.Close()
				os.Remove(f.Name())
			} else {
				f.Close()

				log.Print("legacy shit")
				// deal with legacy desktops that didn't have IDs
				dt.assignFileIDs()
				dt.assignDates()
			}
		}
	}

	users := atomic.AddInt32(&dt.activeUsers, 1)

	log.Printf("New active user on desktop %s (total %d)", name, users)

	return dt, nil
}

func (d *Desktoper) CloseDesktop(name string) error {

	d.mLock.Lock()
	defer d.mLock.Unlock()

	dt, ok := d.m[name]
	if !ok {
		return errors.New("not found")
	}

	n := atomic.AddInt32(&dt.activeUsers, -1)
	if n == 0 {
		log.Print("Close Desktop ", name)
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
