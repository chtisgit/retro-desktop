package api

import "time"

type Desktop struct {
	Files     []File `json:"files"`
	CreateX   int    `json:"createX"`
	CreateY   int    `json:"createY"`
	FileIDCtr int    `json:"fileIDctr`
}

func (d *Desktop) Copy() *Desktop {
	newd := &Desktop{
		CreateX:   d.CreateX,
		CreateY:   d.CreateY,
		FileIDCtr: d.FileIDCtr,
	}

	newd.Files = make([]File, len(d.Files))

	copy(newd.Files, d.Files)

	return newd
}

type DirInfo struct {
	Type    string `json:"type"`
	Desktop string `json:"desktop"`
}

type File struct {
	ID   string `json:"id"`
	Name string `json:"name"`

	X float64 `json:"x"`
	Y float64 `json:"y"`

	Created  *time.Time `json:"created"`
	Modified *time.Time `json:"modified"`

	Directory *DirInfo `json:"dir"`
}

type WSRequest struct {
	Type    string `json:"type"`
	Desktop string `json:"desktop"`

	Move            WSMove            `json:"move"`
	Rename          WSRename          `json:"rename"`
	CreateDirectory WSCreateDirectory `json:"create_directory"`
	DeleteFile      WSDeleteFile      `json:"delete_file"`
}

type WSResponse struct {
	Type    string `json:"type"`
	Desktop string `json:"desktop"`

	Open            WSOpenResponse            `json:"open"`
	CreateFile      WSCreateFileResponse      `json:"create_file"`
	CreateDirectory WSCreateDirectoryResponse `json:"create_directory"`
	DeleteFile      WSDeleteFile              `json:"delete_file"`
	Move            WSMove                    `json:"move"`
	Rename          WSRename                  `json:"rename"`
	UploadStatus    WSUploads                 `json:"upload_status"`
	Error           WSErrorResponse           `json:"error"`
}

type WSRename struct {
	ID      string `json:"id"`
	NewName string `json:"newName"`
}

type WSOpenResponse struct {
	Files []File `json:"files"`
}

type WSErrorResponse struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type WSCreateDirectory struct {
	Name string `json:"name"`
	Type string `json:"type"`

	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type WSCreateDirectoryResponse = File

type WSCreateFileResponse struct {
	File File `json:"file"`
}

type WSMove struct {
	ID  string  `json:"id"`
	ToX float64 `json:"toX"`
	ToY float64 `json:"toY"`
}

type WSDeleteFile struct {
	ID string `json:"id"`
}

type Upload struct {
	UploadID string `json:"uploadID"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Loaded   int64  `json:"loaded"`
	Done     bool   `json:"done"`
	Failed   bool   `json:"failed"`

	StartTime int64 `json:"startTime"`
	EndTime   int64 `json:"endTime"`
}

type WSUploads struct {
	Uploads []Upload `json:"uploads"`
}
