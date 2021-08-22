package desktoper

import (
	"io"
	"time"
)

func slowCopy(w io.Writer, r io.Reader, bw int64) (m int64, err error) {
	if bw == 0 {
		return io.Copy(w, r)
	}

	buf := make([]byte, 256*1024)
	begin := time.Now()

	for {
		n, err := r.Read(buf)
		if err != nil {
			if err == io.EOF {
				err = nil
			}
			return m, err
		}

		m += int64(n)
		if _, err := w.Write(buf[:n]); err != nil {
			return m, err
		}

		actualBw := m / 1024 / (int64(time.Since(begin).Seconds()) + 1)
		if actualBw > bw {
			wait := time.Duration(float64(actualBw-bw) / float64(bw) * float64(time.Since(begin)))
			//log.Printf("actualBw=%d is greater than bw=%d\n", actualBw, bw)
			//log.Printf("waiting %d milliseconds to conform to limit", wait.Milliseconds())
			time.Sleep(wait)
		}

		time.Sleep(time.Millisecond * 100)
	}
}
