
var createPos = { x: 16, y : 16 };

var ws;
var desktopID;
var cmFile = null;

var files = [];

var fileActions = {
	'open': function(event) {
		console.log('open file ');
	},
	'download': function(event) {
		if(cmFile === null) {
			return;
		}
		console.log('download file ', cmFile);
		downloadFile(cmFile);

	},
	'delete': function(event) {
		console.log('delete file ');
	},
}

function doFileAction(action, event)
{
	var f = fileActions[action.substr(10)]
	if(!f) {
		console.log('no such action');
		return;
	}

	f(event);
}

function fileDoubleClickHandler(event)
{
	console.log('double click: ', event.target);
}

function fileSingleClickHandler(event)
{
	console.log('single click: ', event.target);
}


var lastClick = { x: 0, y: 0, ts: 0};
function fileClickHandler(event)
{
	var now = Date.now();
	var last = lastClick.ts;

	lastClick.ts = now;

	// double click 
	if (now - last < 500) {
		fileDoubleClickHandler(event);
		return;
	}

	lastClick.x = event.clientX;
	lastClick.y = event.clientY;

	setTimeout(function() {
		if (now == lastClick.ts) {
			lastClick.ts = 0;
			fileSingleClickHandler(event);
		}
	}, 500);
}

function fileContextMenuHandler(event)
{
	event.preventDefault();
	var cm = document.getElementById('contextmenu');

	var t = event.target;
	if(t.classList.contains('filename')) {
		cmFile = t.innerText;
	}else{
		cmFile = t.parentElement.getElementsByClassName('filename')[0].innerText;
	}

	cm.style.display = 'block';
	cm.style.top = event.clientY+'px';
	cm.style.left = event.clientX+'px';

	console.log('context menu: ', event.target);
}

function cmActionHandler(event)
{
	var ac = event.target.id;
	if(!ac.startsWith('cm-action-')){
		return;
	}

	doFileAction(ac, event);
}

function iconByFilename(name)
{
	var i = name.lastIndexOf('.');
	if(i === -1) {
		return 'default-icon';
	}

	switch(name.substr(i+1).toLowerCase()){
	case 'txt':
	case 'log':
		return 'txt-icon';
	case 'doc':
	case 'docx':
	case 'rtf':
	case 'md':
		return 'richtext-icon';
	case 'js':
		return 'app-icon';
	default:
		return 'default-icon';
	}
}

function downloadFile(filename) {
	var e = document.createElement('a'); 
	e.style.display = 'none';
	e.setAttribute('href',  '/api/desktop/'+desktopID+'/file/'+filename); 
	document.body.appendChild(e); 
	e.click(); 
	document.body.removeChild(e); 
}

async function uploadFile(file) {
	var formData = new FormData();
	formData.append("file", file);

	var res = await fetch('/api/desktop/'+desktopID+'/file', {
		method: "POST",
		body: formData,
		cache: 'no-cache',
		referrerPolicy: 'no-referrer',
	});

	console.log(res);
}

function createFile(name, opts)
{
	var elem = document.createElement('div');
	var iconelem = document.createElement('div');

	var x = opts ? opts.x : null;
	var y = opts ? opts.y : null;

	if(!x || !y) {
		x = createPos.x;
		y = createPos.y;
		createPos.x += 96;
		if (createPos.x + 96 > window.innerWidth) {
			createPos.x = 16;
			createPos.y += 96;
		}
	}

	console.log('create file ', name, ' at ', x+'x'+y);

	elem.classList.add('file');
	elem.style.top = y + 'px';
	elem.style.left = x + 'px';
	elem.draggable = true;
	iconelem.width = 48;
	iconelem.height = 48;
	iconelem.classList.add('icon');
	iconelem.classList.add(iconByFilename(name));

	var span = document.createElement('span');
	span.innerText = name;
	span.classList.add('filename');
	span.classList.add('unselectable');

	elem.addEventListener('click', fileClickHandler);
	elem.addEventListener('contextmenu', fileContextMenuHandler);

	elem.appendChild(iconelem);
	elem.appendChild(span);
	document.getElementById('fileAnchor').appendChild(elem);

	files.push({
		name: name,
	});
}

function dropHandler(ev)
{
	ev.preventDefault();

	var all = [];

	if (ev.dataTransfer.items) {
		for(var i = 0; i !== ev.dataTransfer.items.length; i++){
			var item = ev.dataTransfer.items[i];
			if (item.kind === 'file') {
				var file = ev.dataTransfer.items[i].getAsFile();
				console.log('... file[' + i + '].name = ' + file.name);
				all.push(uploadFile(file))
			}
		}
	}

	if(all.length !== 0){
		Promise.all(all).then(function(){
			console.log('upload complete');
		});
	}
}

function wsOpened(event)
{
	ws.send(JSON.stringify({ type: 'init' }));
}

function wsMessage(event)
{
	var res = JSON.parse(event.data);

	switch(res.type){
	case 'init':
		res.init.files.forEach(function(file) {
			createFile(file.name, {
				x: file.x,
				y: file.y,
			})
		});
		break;
	case 'create_file':
		createFile(res.create_file.name, {
			x: res.create_file.x,
			y: res.create_file.y,
		});
		break;
	default:
		console.log('what is : ', res.type);
	}
}

function wsError(event)
{
	console.error(event);
}

window.addEventListener('load', function () {
	Array.prototype.forEach.call(document.getElementsByClassName('cm-entry'), function(entry) {
		entry.addEventListener('click', cmActionHandler);
	});

	desktopID = window.location.href.substr(window.location.href.lastIndexOf('/')+1);
	ws = new WebSocket(window.location.origin.replace('http', 'ws')+'/api/desktop/'+desktopID+'/ws');
	ws.onopen = wsOpened;
	ws.onmessage = wsMessage;
	ws.onerror = wsError;

});


var startX, startY;
var dragged = null;

document.addEventListener("dragstart", function(event) {
	if (!event.target.classList.contains('file')) {
		return;
	}
	if (navigator.userAgent.search("Firefox") !== -1) {
		return;
	}

	// store a ref. on the dragged elem
	dragged = event.target;
	// make it half transparent
	dragged.style.opacity = .5;

	var r = dragged.getBoundingClientRect();

	startX = r.left - event.clientX;
	startY = r.top - event.clientY;
	console.log('clientX: ', event.clientX, '  clientY: ', event.clientY);
	console.log('start ', r.left, ' ', r.top);
}, false);

document.addEventListener("dragend", function(event) {
	if (dragged === null)
		return;

	// reset the transparency
	dragged.style.opacity = "";
	dragged.style.left = startX+event.clientX+'px';
	dragged.style.top = startY+event.clientY+'px';
	console.log('clientX: ', event.clientX, '  clientY: ', event.clientY);
	console.log('end ', startX+event.clientX, ' ', startY+event.clientY);
	dragged = null;

}, false);


/* events fired on the drop targets */
document.addEventListener("dragover", function( event ) {
	// Standard-Aktion verhindern um das drop-Event zu erlauben
	event.preventDefault();
	if (dragged === null)
		return;

	dragged.style.left = startX+event.clientX+'px';
	dragged.style.top = startY+event.clientY+'px';
	
}, false);


window.addEventListener('click', function(event) {
	if(!event.target.classList.contains('contextmenu')) {
		document.getElementById('contextmenu').style.display = 'none';
		cmFile = null;
	}
});