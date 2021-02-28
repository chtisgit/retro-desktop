package api

type Desktop struct {
	Files   []File `json:"files"`
	CreateX int    `json:"createX"`
	CreateY int    `json:"createY"`
}

type File struct {
	Name string `json:"name"`

	X float64 `json:"x"`
	Y float64 `json:"y"`
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
	Name string  `json:"name"`
	X    float64 `json:"X"`
	Y    float64 `json:"Y"`
}

type WSMove struct {
	Name string  `json:"name"`
	ToX  float64 `json:"toX"`
	ToY  float64 `json:"toY"`
}
