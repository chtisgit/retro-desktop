package api

import "time"

type Desktop struct {
	Files     []File `json:"files"`
	CreateX   int    `json:"createX"`
	CreateY   int    `json:"createY"`
	FileIDCtr int    `json:"fileIDctr`
}

type File struct {
	ID   string `json:"id"`
	Name string `json:"name"`

	X float64 `json:"x"`
	Y float64 `json:"y"`

	Created  *time.Time `json:"created"`
	Modified *time.Time `json:"modified"`
}

type WSRequest struct {
	Type string `json:"type"`

	Move WSMove `json:"move"`
}

type WSResponse struct {
	Type string `json:"type"`

	Init       WSInitResponse       `json:"init"`
	CreateFile WSCreateFileResponse `json:"create_file"`
	Move       WSMove               `json:"move"`
	Error      WSErrorResponse      `json:"error"`
}

type WSInitResponse struct {
	Files []File `json:"files"`
}

type WSErrorResponse struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type WSCreateFileResponse struct {
	File File `json:"file"`
}

type WSMove struct {
	ID  string  `json:"id"`
	ToX float64 `json:"toX"`
	ToY float64 `json:"toY"`
}
