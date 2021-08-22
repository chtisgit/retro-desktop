package api

type Config struct {
	Listen  string `toml:"listen"`
	SaveDir string `toml:"save-dir"`
	WebRoot string `toml:"web-root"`

	UploadBandwidthLimit int64 `toml:"upload-bandwidth-limit"`
}
