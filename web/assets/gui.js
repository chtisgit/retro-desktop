
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

function guiDragStartListener(event)
{
	if (!event.target.classList.contains('window-titlebar')) {
		return;
	}

	// store a ref. on the dragged elem
	var dragged = event.target.parentElement;
	gui.drag.elem = dragged;

	var r = dragged.getBoundingClientRect();

	dragged.style.cursor = 'move';
	dragged.style.zIndex = guiLargestZ();

	gui.drag.startX = r.left - event.clientX;
	gui.drag.startY = r.top - event.clientY;
	gui.drag.x = gui.drag.startX;
	gui.drag.y = gui.drag.startY;
}

function guiDragEndListener(event)
{
	var dragged = gui.drag.elem;
	if (dragged === null)
		return;
	dragged.style.cursor = 'default';
	gui.drag.elem = null;
}


function guiDragOverListener(event)
{
	event.preventDefault();
	
	var dragged = gui.drag.elem;
	if (dragged === null)
		return;

	dragged.style.left = gui.drag.startX+event.clientX+'px';
	dragged.style.top = gui.drag.startY+event.clientY+'px';
	gui.drag.x = event.clientX;
	gui.drag.y = event.clientY;
	
}

function guiLargestZ()
{
	var arr = Array.from(document.getElementsByClassName('window')).map(function(elem) {
		return elem.style.zIndex;
	});
	var z = Math.max.apply(null, arr);
	var z = Math.max(z, gui.z.from)+1;
	return z;
}

function guiWindowCloseHandler(event)
{
	var win = event.target.parentElement.parentElement;
	win.parentElement.removeChild(win);
}

function removeSaveClasses(elem, cb)
{
	Array.from(elem.classList).filter(function(cl) {
		return cl.startsWith('saved-style-');
	}).forEach(function(cl) {
		if(cb) cb(elem, cl);
		elem.classList.remove(cl);
	});
}

function saveSizeAsClasses(elem)
{
	removeSaveClasses(elem);
	['left', 'top', 'width', 'height'].forEach(function(attr) {
		elem.classList.add('saved-style-'+attr+'-'+btoa(elem.style[attr]));
	});
}

function restoreSizeFromClasses(elem)
{
	removeSaveClasses(elem, function(elem, cl) {
		console.log('class: ', cl);
		var s = cl.substr(12).split('-');
		var attr = s[0];
		var value = atob(s[1]);
		console.log(attr + ' = ' + value);

		elem.style[attr] = value;
	});
}

function guiWindowToggleMaximize(win)
{
	if (win.classList.contains('maximized')) {
		restoreSizeFromClasses(win);
		win.classList.remove('maximized');
		win.getElementsByClassName('window-titlebar')[0].draggable = true;
		return;
	}

	win.getElementsByClassName('window-titlebar')[0].draggable = false;
	saveSizeAsClasses(win);
	win.style.top = '0px';
	win.style.left = '0px';
	win.style.width = 'calc(100% - 8px)';
	win.style.height = 'calc(100% - 8px)';
	win.classList.add('maximized');
}

function guiCloseButtonMouseDownHandler(event)
{
	event.preventDefault();
	event.target.style.borderStyle = 'inset';
	gui.drag.elem = null;
}
function guiCloseButtonMouseUpHandler(event)
{
	event.target.style.borderStyle = 'outset';
	setTimeout(function() {
		guiWindowCloseHandler(event)
	}, 100);
}
function guiMaximizeButtonMouseDownHandler(event)
{
	event.preventDefault();
	event.target.style.borderStyle = 'inset';
	gui.drag.elem = null;
}
function guiMaximizeButtonMouseUpHandler(event)
{
	event.target.style.borderStyle = 'outset';
	setTimeout(function() {
		guiWindowToggleMaximize(event.target.parentElement.parentElement);
	}, 100);
}

function guiCreateWindow(opts)
{
	if (global && global.isMobile) {
		opts.maximized = true;
		opts.noMaximizeButton = true;
	}

	var win = document.createElement('div');
	var tb = document.createElement('div');
	var title = document.createElement('span');
	var content = document.createElement('div');
	var maximizeButton = document.createElement('div');
	var closeButton = document.createElement('div');

	win.classList.add('window');
	tb.classList.add('window-titlebar', 'unselectable');
	content.classList.add('window-content', 'unselectable');
	maximizeButton.classList.add('window-titlebar-icon', 'unselectable');
	closeButton.classList.add('window-titlebar-icon', 'unselectable');
   
	tb.appendChild(title);
	tb.appendChild(closeButton);
	if (!opts.noMaximizeButton)
		tb.appendChild(maximizeButton);
	tb.draggable = true;

	win.appendChild(tb);
	win.appendChild(content);

	title.innerText = opts.title || '<unnamed>';
	title.classList.add('titlebar-text');
	maximizeButton.innerText = '⛶';
	closeButton.innerText = 'x';
	//closeButton.addEventListener('click', guiWindowCloseHandler);
	maximizeButton.addEventListener('mousedown', guiMaximizeButtonMouseDownHandler);
	maximizeButton.addEventListener('mouseup', guiMaximizeButtonMouseUpHandler);
	closeButton.addEventListener('mousedown', guiCloseButtonMouseDownHandler);
	closeButton.addEventListener('mouseup', guiCloseButtonMouseUpHandler);
	if (opts.onClose) {
		closeButton.addEventListener('mouseup', function() {
			opts.onClose(win);
		});
	}

	win.style.top = (opts.y ? opts.y : 200) + 'px';
	win.style.left = (opts.x ? opts.x : 200) + 'px';
	win.style.width = (opts.width ? opts.width : 500) + 'px';
	win.style.height = (opts.height ? opts.height : 400) + 'px';

	if (opts.maximized) {
		win.style.top = '0px';
		win.style.left = '0px';
		win.style.width = '100%';
		win.style.height = '100%';
		win.style.position = 'fixed';
		win.classList.add('maximized');
	}

	win.style.zIndex = guiLargestZ();

	document.getElementById('window-anchor').appendChild(win);

	if (!opts.noResize)
		makeResizable(win);

	return win;
}

function guiChangeWindowTitle(win, title) {
	var res = win.getElementsByClassName('titlebar-text');
	if (res.length === 1) {
		res[0].innerText = title;
	}
}

function guiInit()
{
	window.addEventListener('dragstart', guiDragStartListener);
	window.addEventListener('dragover', guiDragOverListener);
	window.addEventListener('dragend', guiDragEndListener);
}

function within(mx, my, x, y, w, h)
{
	return mx >= x && my >= y && mx <= x+w && my <= y+h;
}


function makeResizable(p)
{
	var startX, startY, startWidth, startHeight;
	p.addEventListener('mousedown', function(e) {
		startX = e.clientX;
		startY = e.clientY;

		var x = p.offsetLeft+p.offsetWidth-20;
		var y = p.offsetTop+p.offsetHeight-20;
		
		var dir = '';

		if(within(startX, startY, p.offsetLeft, p.offsetTop+p.offsetHeight-8, p.offsetWidth, 16)) {
			dir = 's';
		}

		if(within(startX, startY, p.offsetLeft+p.offsetWidth-8, p.offsetTop, 16, p.offsetHeight)) {
			dir += 'e';
		}

		if(dir === '') {
			return;
		}

		p.style.cursor = dir+'-resize';

		console.log('mousedown listener');
		startWidth = parseInt(document.defaultView.getComputedStyle(p).width, 10);
		startHeight = parseInt(document.defaultView.getComputedStyle(p).height, 10);
		var doDrag = function(e) {
			if(dir.endsWith('e'))
				p.style.width = Math.max(300, startWidth + e.clientX - startX) + 'px';
			if(dir.startsWith('s'))
				p.style.height = Math.max(300, startHeight + e.clientY - startY) + 'px';			
		};
		var stopDrag = function(e) {
			window.removeEventListener('mousemove', doDrag, false);
			window.removeEventListener('mouseup', stopDrag, false);
			p.style.cursor = 'default';
		};

		window.addEventListener('mousemove', doDrag, false);
		window.addEventListener('mouseup', stopDrag, false);		
	}, false);
}

function confirmPrompt(title, message, options, closeCallback) {
        var win = guiCreateWindow({
		title: title,
		x: 250,
		y: 300,
		width: 700,
		height: 150,
		onClose: closeCallback,
		noResize: true,
        });

	
        var content = win.getElementsByClassName('window-content')[0];

	var div = document.createElement('div');
	div.style.width = '100%';
	div.style.padding = '8px';
	div.innerText = message;

	var btns = document.createElement('div');
	btns.style.width = '100%';
	btns.style.display = 'flex';
	btns.style.justifyContent = 'space-around';
	btns.style.marginTop = '8px';

	for (var i = 0; i !== options.length; i++) {
		var opt = options[i];

		var btn = document.createElement('button');
		btn.type = 'button';
		btn.style.padding = '4px';
		btn.onclick = (function(opt) {
			return function() {
				win.parentElement.removeChild(win);
				if (opt.callback)
					setTimeout(opt.callback, 0);
			};
		})(opt);
		btn.innerText = opt.text;

		btns.appendChild(btn);
	}

        content.appendChild(div);
	content.appendChild(btns);
}

function messageBox(title, message, cb) {
	confirmPrompt(title, message, [
		{ text: 'Ok', callback: cb }
	], cb);
}

guiInit();
