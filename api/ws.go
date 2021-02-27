package api

type File struct {
	Name string `json:"name"`

	X int `json:"x"`
	Y int `json:"y"`
}

type WSRequest struct {
	Type string `json:"type"`
}

type WSResponse struct {
	Type string `json:"type"`

	Init       WSInitResponse       `json:"init"`
	CreateFile WSCreateFileResponse `json:"create_file"`
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
	Name string `json:"name"`
	X    int    `json:"X"`
	Y    int    `json:"Y"`
}
