package desktoper

import (
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chtisgit/retro-desktop/api"
)

type UploadManager struct {
	dt *Desktop

	lock       sync.Mutex
	uploads    map[string]*api.Upload
	stopWorker func()
}

func newUploadManager(dt *Desktop) *UploadManager {
	u := &UploadManager{
		dt:      dt,
		uploads: make(map[string]*api.Upload),
	}

	return u
}

func (u *UploadManager) Add(filename string, size int64) (*api.Upload, error) {
	u.lock.Lock()
	defer u.lock.Unlock()

	id, err := randomStr(12)
	if err != nil {
		return nil, err
	}

	upl := &api.Upload{
		UploadID:  id,
		Filename:  filename,
		Size:      size,
		StartTime: time.Now().Unix(),
	}

	if len(u.uploads) == 0 {
		log.Printf("start upload status worker")
		u.startUploadsWorker()
	}

	u.uploads[id] = upl

	return upl, nil
}

func (u *UploadManager) Get() []api.Upload {
	u.lock.Lock()
	uploads := make([]api.Upload, len(u.uploads))
	i := 0
	for _, v := range u.uploads {
		uploads[i] = api.Upload{
			UploadID: v.UploadID,
			Filename: v.Filename,
			Size:     v.Size,
			Loaded:   atomic.LoadInt64(&v.Loaded),
			Done:     v.Done,
			Failed:   v.Failed,
		}
		i++
	}
	u.lock.Unlock()

	return uploads
}

func (u *UploadManager) Mark(id string, done, failed bool) {
	u.lock.Lock()

	upl, ok := u.uploads[id]
	if ok {
		upl.Done = done
		upl.Failed = failed

		if upl.EndTime == 0 && (done || failed) {
			upl.EndTime = time.Now().Unix()
		}
		if done {
			atomic.StoreInt64(&upl.Loaded, upl.Size)
		}
	}

	u.lock.Unlock()
}

func (u *UploadManager) removeOld() {
	u.lock.Lock()
	before := len(u.uploads)

	for id, upl := range u.uploads {
		if upl.EndTime != 0 && time.Since(time.Unix(upl.EndTime, 0)) >= 5*time.Second {
			delete(u.uploads, id)
		}
	}

	if before != 0 && len(u.uploads) == 0 {
		log.Printf("stop upload status worker")
		u.stopWorker()
	}
	u.lock.Unlock()
}

func (u *UploadManager) startUploadsWorker() {
	stopCh := make(chan struct{})
	u.stopWorker = func() {
		close(stopCh)
	}

	go func() {
		t := time.NewTicker(time.Second * 2)
		for {
			u.dt.sendUploadStatus(u.Get())
			u.removeOld()

			select {
			case <-t.C:
				break
			case <-stopCh:
				return
			case <-u.dt.close:
				return
			}
		}
	}()
}
