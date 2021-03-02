
var gui = {
	drag: {
		startX: null,
		startY: null,
		elem: null,
		x: null,
		y: null
	},
	z: {
		from: 1000,
		to: 1500,
	}
};

function guiDragStartListener(event) {
	if (!event.target.classList.contains('window-titlebar')) {
		return;
	}

	// store a ref. on the dragged elem
	var dragged = event.target.parentElement;
	gui.drag.elem = dragged;

	var r = dragged.getBoundingClientRect();

	
	dragged.style.zIndex = guiLargestZ();

	gui.drag.startX = r.left - event.clientX;
	gui.drag.startY = r.top - event.clientY;
	gui.drag.x = gui.drag.startX;
	gui.drag.y = gui.drag.startY;
}

function guiDragEndListener(event) {
	var dragged = gui.drag.elem;
	if (dragged === null)
		return;
	gui.drag.elem = null;
}


function guiDragOverListener(event) {
	event.preventDefault();
	
	var dragged = gui.drag.elem;
	if (dragged === null)
		return;

	dragged.style.left = gui.drag.startX+event.clientX+'px';
	dragged.style.top = gui.drag.startY+event.clientY+'px';
	gui.drag.x = event.clientX;
	gui.drag.y = event.clientY;
	
}

function guiLargestZ() {
	var arr = Array.from(document.getElementsByClassName('window')).map(function(elem) {
		return elem.style.zIndex;
	});
	var z = Math.max.apply(null, arr);
	var z = Math.max(z, gui.z.from)+1;
	return z;
}

function guiWindowCloseHandler(event) {
	var win = event.target.parentElement.parentElement;
	console.log(win);
	win.parentElement.removeChild(win);
}

function guiCreateWindow(opts) {
	var win = document.createElement('div');
	var tb = document.createElement('div');
	var title = document.createElement('span');
	var content = document.createElement('div');
	var closeButton = document.createElement('div');

	win.classList.add('window');
	tb.classList.add('window-titlebar', 'unselectable');
	content.classList.add('window-content', 'unselectable');
	closeButton.classList.add('window-titlebar-icon', 'unselectable');
   
	tb.appendChild(title);
	tb.appendChild(closeButton);
	tb.draggable = true;

	win.appendChild(tb);
	win.appendChild(content);

	title.innerText = opts.title || '<unnamed>';
	closeButton.innerText = 'x';
	closeButton.addEventListener('click', guiWindowCloseHandler);

	win.style.top = (opts.y ? opts.y : 200) + 'px';
	win.style.left = (opts.x ? opts.x : 200) + 'px';
	win.style.width = (opts.width ? opts.width : 500) + 'px';
	win.style.height = (opts.height ? opts.height : 400) + 'px';

	win.style.zIndex = guiLargestZ();

	document.getElementById('window-anchor').appendChild(win);

	return win;
}

function guiInit()
{
	window.addEventListener('dragstart', guiDragStartListener);
	window.addEventListener('dragover', guiDragOverListener);
	window.addEventListener('dragend', guiDragEndListener);
}


guiInit();