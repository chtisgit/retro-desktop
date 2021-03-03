
var global = {
	ws: null,
	wsGood: false,
	createPos: { x: 16, y : 16 },
	cmFile: null,
	desktopID: null,
	files: [],
	drag: {
		elem: null,
		startX: null,
		startY: null,
		x: null,
		y: null,
	},
	lastClick: { x: 0, y: 0, ts: 0},
	fileActions: {
		'open': function(event) {
			openFile(global.cmFile);
		},
		'download': function(event) {
			if(global.cmFile === null) {
				return;
			}
			console.log('download file ', global.cmFile);
			downloadFile(global.cmFile);
	
		},
		'delete': function(event) {
			if(global.cmFile === null) {
				return;
			}
			global.ws.send(JSON.stringify({
				type: 'delete_file',
				delete_file: {
					id: global.cmFile,
				}
			}));
		},
	},
	fileTypes: {},
};

function newAPI()
{
	return {
		fileContentURL: fileContentURL,
		fileDownloadURL: fileDownloadURL,
	};
}

function openFile(id)
{
	var name = getFileName(id);
	if(!id || !name) {
		return;
	}

	var p = name.lastIndexOf('.');
	if (p === -1) {
		return;
	}

	var ext = name.substr(p+1);

	var app = global.fileTypes[ext]
	if(!app) {
		return;
	}

	app.start(newAPI(), {
		id: id,
		name: name,
	});
}

function getFileName(id)
{
	var f = document.getElementById('fileID-'+id);
	if(!f) {
		return null;
	}

	return f.getElementsByClassName('filename')[0].innerText;
}

function doFileAction(action, event)
{
	var f = global.fileActions[action.substr(10)]
	if(!f) {
		console.log('no such action');
		return;
	}

	f(event);
}

function fileDoubleClickHandler(event)
{
	console.log('double click: ', event.target);
	openFile(getFileIDFromDOM(event.target));
}

function fileSingleClickHandler(event)
{
	console.log('single click: ', event.target);
	openFile(getFileIDFromDOM(event.target));
}

function fileClickHandler(event)
{
	var now = Date.now();
	var last = global.lastClick.ts;

	global.lastClick.ts = now;

	// double click 
	if (now - last < 500) {
		fileDoubleClickHandler(event);
		return;
	}

	global.lastClick.x = event.clientX;
	global.lastClick.y = event.clientY;

	setTimeout(function() {
		if (now == global.lastClick.ts) {
			global.lastClick.ts = 0;
			fileSingleClickHandler(event);
		}
	}, 500);
}

function getFileIDFromDOM(elem)
{
	if(elem.classList.contains('filename') || elem.classList.contains('icon')) {
		return getFileIDFromDOM(elem.parentElement);
	}

	var s = elem.id;
	if(!s || !s.startsWith('fileID-')) {
		return null;
	}

	return s.substr(7)
}

function fileContextMenuHandler(event)
{
	event.preventDefault();
	var cm = document.getElementById('contextmenu');

	global.cmFile = getFileIDFromDOM(event.target);

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

function fileDownloadURL(id) {
	return '/api/desktop/'+global.desktopID+'/file/'+id+'/download';
}

function fileContentURL(id) {
	return '/api/desktop/'+global.desktopID+'/file/'+id+'/content';
}

function downloadFile(id) {
	var e = document.createElement('a'); 
	e.style.display = 'none';
	e.setAttribute('href', fileDownloadURL(id)); 
	document.body.appendChild(e); 
	e.click(); 
	document.body.removeChild(e); 
}

async function uploadFile(file, pos) {
	var formData = new FormData();
	formData.append('file', file);
	formData.append('x', pos.x-24);
	formData.append('y', pos.y-24);

	var res = await fetch('/api/desktop/'+global.desktopID+'/file', {
		method: 'POST',
		body: formData,
		cache: 'no-cache',
		referrerPolicy: 'no-referrer',
	});

	console.log(res);
}

function createFile(file)
{
	var elem = document.createElement('div');
	var iconelem = document.createElement('div');

	var x = file.x;
	var y = file.y;

	if(!x || !y) {
		x = global.createPos.x;
		y = global.createPos.y;
		global.createPos.x += 96;
		if (global.createPos.x + 96 > window.innerWidth) {
			global.createPos.x = 16;
			global.createPos.y += 96;
		}
	}

	console.log('create file ', file.name, ' at ', x+'x'+y);

	elem.id = 'fileID-'+file.id;
	elem.classList.add('file');
	elem.style.top = y + 'px';
	elem.style.left = x + 'px';
	elem.draggable = true;
	iconelem.width = 48;
	iconelem.height = 48;
	iconelem.classList.add('icon');
	iconelem.classList.add(iconByFilename(file.name));

	var span = document.createElement('span');
	span.innerText = file.name;
	span.classList.add('filename');
	span.classList.add('unselectable');

	elem.addEventListener('click', fileClickHandler);
	elem.addEventListener('contextmenu', fileContextMenuHandler);

	elem.appendChild(iconelem);
	elem.appendChild(span);
	document.getElementById('file-anchor').appendChild(elem);

	/*
	global.files.push({
		id: file.id,
		name: file.name,
	});
	*/
}

function deleteFile(id)
{
	var f = document.getElementById('fileID-'+id);
	if(!f) {
		return;
	}

	f.parentElement.removeChild(f);
}

function dropHandler(ev)
{
	ev.preventDefault();

	var all = [];

	var pos = {
		x: ev.clientX,
		y: ev.clientY,
	};

	if (ev.dataTransfer.items) {
		for(var i = 0; i !== ev.dataTransfer.items.length; i++){
			var item = ev.dataTransfer.items[i];
			if (item.kind === 'file') {
				var file = ev.dataTransfer.items[i].getAsFile();
				console.log('... file[' + i + '].name = ' + file.name);
				
				all.push(uploadFile(file, pos))

				pos.x += 64;
				if (pos.x >= 1920-64) {
					pos.x = 16;
					pos.y += 96;
				}
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
	global.ws.send(JSON.stringify({ type: 'init' }));
	global.wsGood = true;
}

function wsMessage(event)
{
	var res = JSON.parse(event.data);

	console.log('wsMessage');

	switch(res.type){
	case 'init':
		res.init.files.forEach(function(file) {
			createFile(file);
		});
		break;
	case 'create_file':
		createFile(res.create_file.file);
		break;
	case 'delete_file':
		deleteFile(res.delete_file.id);
		break;
	case 'move':
		moveFile(res.move.id, res.move.toX, res.move.toY);
		break;
	case 'error':
		console.log('backend error: ', res.error.text);
		break;
	case 'ping':
		break;
	default:
		console.log('what is : ', res.type);
	}
}

function wsError(event)
{
	global.wsGood = false;
	console.error(event);
}

window.addEventListener('load', function () {
	Array.prototype.forEach.call(document.getElementsByClassName('cm-entry'), function(entry) {
		entry.addEventListener('click', cmActionHandler);
	});

	global.desktopID = window.location.href.substr(window.location.href.lastIndexOf('/')+1);
	global.ws = new WebSocket(window.location.origin.replace('http', 'ws')+'/api/desktop/'+global.desktopID+'/ws');
	global.ws.onopen = wsOpened;
	global.ws.onmessage = wsMessage;
	global.ws.onerror = wsError;

	window.setInterval(function() {
		if (!global.wsGood) 
			return;
		global.ws.send(JSON.stringify({ type: 'ping' }));
	}, 20000);

});


document.addEventListener("dragstart", function(event) {
	if (!event.target.classList.contains('file')) {
		return;
	}

	// store a ref. on the dragged elem
	var dragged = event.target;
	global.drag.elem = dragged;
	// make it half transparent
	dragged.style.opacity = .5;

	var r = dragged.getBoundingClientRect();

	global.drag.startX = r.left - event.clientX;
	global.drag.startY = r.top - event.clientY;
	global.drag.x = global.drag.startX;
	global.drag.y = global.drag.startY;
}, false);

function moveFile(id, x, y)
{
	var f = document.getElementById('fileID-'+id)
	if(!f) {
		return;
	}

	f.style.left = x+'px';
	f.style.top = y+'px';
}

document.addEventListener("dragend", function(event) {
	var dragged = global.drag.elem;
	if (dragged === null)
		return;
	global.drag.elem = null;

	// reset the transparency
	dragged.style.opacity = '';

	var x = global.drag.startX+global.drag.x;
	var y = global.drag.startY+global.drag.y;

	global.ws.send(JSON.stringify({
		type: 'move',
		move: {
			id: getFileIDFromDOM(dragged),
			toX: x,
			toY: y,
		},
	}));

}, false);


/* events fired on the drop targets */
document.addEventListener("dragover", function( event ) {
	// Standard-Aktion verhindern um das drop-Event zu erlauben
	event.preventDefault();
	
	var dragged = global.drag.elem;
	
	if (dragged === null)
		return;

	dragged.style.left = global.drag.startX+event.clientX+'px';
	dragged.style.top = global.drag.startY+event.clientY+'px';
	global.drag.x = event.clientX;
	global.drag.y = event.clientY;
	
}, false);


window.addEventListener('click', function(event) {
	if(!event.target.classList.contains('contextmenu')) {
		document.getElementById('contextmenu').style.display = 'none';
		global.cmFile = null;
	}
});