package desktoper

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chtisgit/retro-desktop/api"
)

var ErrDesktopExists = errors.New("desktop exists")
var ErrDesktopNotFound = errors.New("desktop not found")
var ErrDesktopCorrupt = errors.New("desktop corrupt")

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
		opened:    time.Now(),
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

func (d *Desktoper) writeDesktop(name string, dt *Desktop) error {
	d.backupDesktop(name)

	// don't save empty desktops where a file was never uploaded
	if len(dt.state.Files) == 0 && dt.state.FileIDCtr == 0 {
		os.Remove(filepath.Join(d.path, name))
		return nil
	}

	f, err := os.OpenFile(filepath.Join(d.path, name+".json"), os.O_WRONLY|os.O_TRUNC|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return err
	}

	err = json.NewEncoder(f).Encode(dt.state)
	f.Close()

	if err != nil {
		d.restoreDesktop(name)
	}

	return err
}

func (d *Desktoper) CreateDesktop(name string) error {
	d.mLock.Lock()
	defer d.mLock.Unlock()

	log.Printf("Create Desktop %s\n", name)

	_, ok := d.m[name]
	if ok {
		return ErrDesktopExists
	}

	dt := d.newDesktop(name)
	err := d.writeDesktop(name, dt)

	if err == nil {
		d.m[name] = dt
	}

	return err
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
		if err != nil {
			return nil, ErrDesktopNotFound
		}

		err = json.NewDecoder(f).Decode(&dt.state)
		f.Close()
		if err != nil {
			return nil, ErrDesktopCorrupt
		}
	}

	users := atomic.AddInt32(&dt.activeUsers, 1)

	log.Printf("New active user on desktop %s (total %d)", name, users)

	return dt, nil
}

func (d *Desktoper) backupDesktop(name string) error {
	path := filepath.Join(d.path, name+".json")
	return os.Rename(path, path+".backup")
}

func (d *Desktoper) restoreDesktop(name string) error {
	path := filepath.Join(d.path, name+".json")
	return os.Rename(path+".backup", path)
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
		err := d.writeDesktop(name, dt)
		if err != nil {
			log.Printf("Error during writeDesktop: %s", err)
		}

		delete(d.m, name)

		return err
	}

	return nil
}

type Status = []string

func durationStr(d time.Duration) string {
	if h := int(d.Hours()); h > 0 {
		return fmt.Sprintf("%dh", h)
	}
	if m := int(d.Minutes()); m > 0 {
		return fmt.Sprintf("%dm", m)
	}
	if s := int(d.Seconds()); s >= 5 {
		return fmt.Sprintf("%ds", s)
	}
	return "just now"
}

func (d *Desktoper) Status() (st Status) {
	d.mLock.Lock()

	list := make([]*Desktop, len(d.m))
	st = make([]string, len(d.m))

	i := 0
	for _, dt := range d.m {
		list[i] = dt
		i++
	}

	// sort by time open, longest open first
	sort.Slice(list, func(i, j int) bool {
		return list[i].opened.After(list[j].opened)
	})

	now := time.Now()
	for i, dt := range list {
		st[i] = fmt.Sprintf("desktop=\"%s\" open-for=\"%s\" active-users=%d", dt.name, durationStr(now.Sub(dt.opened)), dt.activeUsers)
	}

	d.mLock.Unlock()

	return
}
