package desktoper

import (
	"errors"
	"reflect"

	"github.com/chtisgit/retro-desktop/api"
)

type Subscriber struct {
	all map[string]subscription
}

type subscription struct {
	desktop  *Desktop
	messages <-chan *api.WSResponse
	unsub    func()
}

var ErrAlreadySubscribed = errors.New("already subscribed")
var ErrSubNotFound = errors.New("subscription not found")

func NewSubscriber() *Subscriber {
	return &Subscriber{
		all: make(map[string]subscription),
	}
}

func (s *Subscriber) Subscribe(dter *Desktoper, name string) error {
	_, ok := s.all[name]
	if ok {
		return ErrAlreadySubscribed
	}

	dt, err := dter.OpenDesktop(name)
	if err != nil {
		return err
	}

	msgs, unsub := dt.Messages()

	s.all[name] = subscription{
		desktop:  dt,
		messages: msgs,
		unsub:    unsub,
	}
	return nil
}

func (s *Subscriber) Desktop(name string) (*Desktop, error) {
	sub, ok := s.all[name]
	if !ok {
		return nil, ErrSubNotFound
	}

	return sub.desktop, nil
}

func (s *Subscriber) Unsubscribe(name string) error {
	sub, ok := s.all[name]
	if !ok {
		return ErrSubNotFound
	}

	delete(s.all, name)

	sub.unsub()
	return sub.desktop.Close()
}

func (s *Subscriber) UnsubscribeAll() {
	for name := range s.all {
		s.Unsubscribe(name)
	}
}

func (s *Subscriber) Messages() (cases []reflect.SelectCase) {
	N := len(s.all)
	cases = make([]reflect.SelectCase, N)

	i := 0
	for _, sub := range s.all {
		cases[i] = reflect.SelectCase{
			Dir:  reflect.SelectRecv,
			Chan: reflect.ValueOf(sub.messages),
		}
		i++
	}

	return
}
