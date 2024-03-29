
var global = {
	isMobile: false,
	ws: null,
	wsGood: false,
	createPos: { x: 16, y : 16 },
	cmFile: null,
	desktopID: null,
	startMenu: {
		open: false,
	},
	files: [],
	wsMessageHandlers: [],
	drag: {
		elem: null,
		startX: null,
		startY: null,
		x: null,
		y: null,
	},
	openDesktops: {},
	lastClick: { x: 0, y: 0, ts: 0},
	fileActions: {
		'new-directory': function(event) {
			wsCreateDirectory('Neuer Ordner');
		},
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
		'descend': function(event) {
			if(global.cmFile === null) {
				return;
			}

			var subdesktop = getAttributeFromClass(global.cmFile, 'subdesktop-');
			if(!subdesktop) {
				return;
			}

			// TODO: descend without need for reload (reuse the open websocket).
			window.location.href = '//' + window.location.host + '/d/' + subdesktop;
		},
		'copy-link': function(event) {
			if(global.cmFile === null){
				return;
			}

			const el = document.createElement('textarea');
			el.value = '//' + window.location.host + fileDownloadURL(fileInfo(global.cmFile));
			document.body.appendChild(el);
			//el.style.visibility = 'hidden';
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
		},
		'rename': function(event) {
			if (global.cmFile === null) {
				return;
			}

			editFilename(global.cmFile);
		},
		'delete': function(event) {
			if(global.cmFile === null) {
				return;
			}

			var file = global.cmFile;
			var deleteAction = function() {
				global.ws.send(JSON.stringify({
					type: 'delete_file',
					desktop: getFileDesktop(file),
					delete_file: {
						id: getFileID(file),
					}
				}));
			};

			if (!confirmPrompt) {
				deleteAction();
				return;
			}

			var filename = getFileName(file);

			confirmPrompt('Delete File',
				`Do you really want to delete the file "${filename}"`,
				[
					{ text: 'Yes', callback: deleteAction },
					{ text: 'No' }
				]);
		},
	},
	fileTypes: {},
	handleUploadEvent: null,
};

function editFilename(file) {
	var filenamespan = file.getElementsByClassName('filename')[0];
	var origdisplay = filenamespan.style.display;
	var origfilename = getFileName(file);
	var inp = document.createElement('input');
	var closed = false;
	var close = function(apply) {
		if (closed) return;
		closed = true;

		if (apply) {
			global.ws.send(JSON.stringify({
				type: 'rename',
				desktop: getFileDesktop(file),
				rename: {
					newName: inp.value,
					id: getFileID(file),
				},
			}));
		}

		file.removeChild(inp);
		filenamespan.style.display = origdisplay;
	};

	inp.type = 'text';
	inp.classList.add('filename-input');
	inp.value = origfilename;
	inp.maxLength = 96;
	inp.addEventListener('blur', function() {
		setTimeout(function() {
			close(true)
		}, 0);
	})
	inp.addEventListener('keydown', function(event) {
		if (event.code === 'Enter' || event.code === 'Escape') {
			close(event.code === 'Enter');
		}
	});
	
	filenamespan.style.display = 'none';
	file.append(inp);

	inp.focus();
}

function newAPI()
{
	return {
		isMobile: global.isMobile,
		fileContentURL: fileContentURL,
		fileDownloadURL: fileDownloadURL,
		openDesktop: openDesktop,
		closeDesktop: closeDesktop,
	};
}

function showDisconnectedLayer()
{
	console.log('showDisconnectedLayer');
	var x = document.getElementById('disconnected-layer');
	x.style.display = 'block';
	x.style.zIndex = Array.from(document.getElementsByClassName('window'))
		.reduce(function(prev, cur) {
			return Math.max(prev, cur);
		}, x.style.zIndex);
}

function openFile(file)
{
	var name = getFileName(file);
	if(!name) {
		return;
	}

	if (file.classList.contains('directory')) {
		if (!global.explorer) {
			return;
		}

		global.explorer.start(newAPI(), {
			desktop: getAttributeFromClass(file, 'subdesktop-'),
			name: name,
		});
		return;
	}

	var p = name.lastIndexOf('.');
	if (p === -1) {
		return;
	}

	var ext = name.substr(p+1).toLowerCase();

	var app = global.fileTypes[ext]
	if(!app) {
		return;
	}

	app.start(newAPI(), {
		id: getFileID(file),
		desktop: getFileDesktop(file),
		name: name,
	});
}

function getAttributeFromClass(elem, prefix)
{
	var res = null;

	elem.className.split(' ').forEach(function(cl) {
		if (res) return;
		if (cl.startsWith(prefix)) {
			res = cl.substr(prefix.length);
			return;
		}
	});
	
	return res;
}

function chooseFile(file)
{
	if(file.classList.contains('filename') || file.classList.contains('icon'))
		file = file.parentElement;

	if(file.classList.contains('file'))
		return file;
	
	return null;
}

function fileInfo(file)
{
	var info = {};
	info.id = getFileID(file);
	if(!info.id) return null;
	info.name = getFileName(file);
	if(!info.name) return null;
	info.desktop = getFileDesktop(file);
	if(!info.desktop) return null;
	return info;
}

function getFileID(file)
{	
	return getAttributeFromClass(file, 'fileID-');
}

function getFileDesktop(file)
{
	return getAttributeFromClass(file, 'desktopID-');
}

function getFileName(file)
{
	if(file.classList.contains('fullfilename')){
		return file.innerText;
	}
	if(file.classList.contains('icon')) {
		file = file.parentElement;
	}

	var fn = file.getElementsByClassName('fullfilename');
	if(!fn || fn.length !== 1) return null;

	return fn[0].innerText;
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

function fileDoubleClickHandler(file)
{
	console.log('double click: ', file);
	openFile(file);
}

function fileSingleClickHandler(file)
{
	console.log('single click: ', file);
	openFile(file);
}

function fileClickHandler(event)
{
	var now = Date.now();
	var last = global.lastClick.ts;

	global.lastClick.ts = now;

	// mess with target
	var file = chooseFile(event.target);
	if (!file)
		return;

	// double click 
	if (now - last < 500) {
		fileDoubleClickHandler(file);
		return;
	}

	global.lastClick.x = event.clientX;
	global.lastClick.y = event.clientY;

	setTimeout(function() {
		if (now == global.lastClick.ts) {
			global.lastClick.ts = 0;
			fileSingleClickHandler(file);
		}
	}, 500);
}

function shortFilename(name) {
	if (name.length < 20) {
		return name;
	}

	var i = name.lastIndexOf('.');
	var ext = '';
	if (i !== -1) {
		ext = name.substr(i);
		name = name.substr(0, i);
	}

	return name.substr(0, 17-ext.length) + '..' + ext;
}

function fileContextMenuHandler(event)
{
	event.preventDefault();

	var file = chooseFile(event.target);
	global.cmFile = file;
	if (event.target !== document.getElementById('outer') && !file)
		return;

	showContextMenu(event.pageX, event.pageY, file);
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

function fileDownloadURL(file) {
	if(!file) return null;
	return '/api/desktop/'+file.desktop+'/file/'+file.id+'/download';
}

function fileContentURL(file) {
	if(!file) return null;
	return '/api/desktop/'+file.desktop+'/file/'+file.id+'/content';
}

function downloadFile(file) {
	var e = document.createElement('a'); 
	e.style.display = 'none';
	e.setAttribute('target', '_blank');
	e.setAttribute('href', fileDownloadURL(fileInfo(file))); 
	document.body.appendChild(e); 
	e.click(); 
	document.body.removeChild(e); 
}

async function uploadFile(file, pos) {
	var formData = new FormData();
	formData.append('size', +file.size);
	formData.append('x', pos.x-24);
	formData.append('y', pos.y-24);
	formData.append('file', file);

	var res = await fetch('/api/desktop/'+global.desktopID+'/file', {
		method: 'POST',
		body: formData,
		cache: 'no-cache',
		referrerPolicy: 'no-referrer',
	});
}

function setFilename(elem, filename)
{
	var span = elem.getElementsByClassName('filename');
	if (span && span.length) {
		span = span[0];
	}else{
		span = document.createElement('span');
		span.classList.add('filename');
		span.classList.add('unselectable');
		elem.append(span);
	}
	span.innerText = shortFilename(filename);

	var span2 = elem.getElementsByClassName('fullfilename');
	if (span2 && span2.length) {
		span2 = span2[0];
	}else{
		span2 = document.createElement('span');
		span2.classList.add('fullfilename');
		span2.style.display = 'none';
		elem.append(span2);
	}
	span2.innerText = filename;

	return span;
}

function createFile(file, desktop)
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

	if (desktop) {
		elem.classList.add('desktopID-'+desktop);
	}
	elem.classList.add('fileID-'+file.id);
	elem.classList.add('file');
	elem.style.top = y + 'px';
	elem.style.left = x + 'px';
	elem.draggable = true;
	iconelem.width = 48;
	iconelem.height = 48;
	iconelem.classList.add('icon');
	if(file.dir){
		elem.classList.add('directory');
		if (file.dir.type === 'subdesktop') {
			iconelem.classList.add('directory-icon');
			elem.classList.add('subdesktop-'+file.dir.desktop);
		}else{
			iconelem.classList.add('what-drive-icon');
		}
	}else{
		iconelem.classList.add(iconByFilename(file.name));
	}

	elem.appendChild(iconelem);
	var span = setFilename(elem, file.name);

	elem.addEventListener('click', fileClickHandler);
	elem.addEventListener('contextmenu', fileContextMenuHandler);

	return elem;
}

function deleteFile(id, desktop)
{
	var f = document.getElementsByClassName('fileID-'+id);
	if(!f || f.length === 0) {
		return;
	}

	Array.from(f).forEach(function(file) {
		if(file.classList.contains('desktopID-'+desktop)){	
			file.parentElement.removeChild(file);
		}
	});
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
	openDesktop(global.desktopID, rootWSHandler);
	global.wsGood = true;
}

function openDesktop(desktop, handler) {
	addWSMessageHandler(desktop, handler);

	// keep track of open desktops, s.t. we only close them when all windows to a desktop are closed.
	if (global.openDesktops[desktop]) {
		global.openDesktops[desktop]++;
	}else{
		global.openDesktops[desktop] = 1;
	}

	global.ws.send(JSON.stringify({ type: 'open', desktop: desktop }));
}

function closeDesktop(desktop, handler) {
	removeWSMessageHandler(desktop, handler);
	
	if (!global.openDesktops[desktop]) {
		console.log('close of desktop that is not open ("'+desktop+'")');
		return;
	}

	global.openDesktops[desktop]--;

	// TODO: implement send close
}

function wsMessage(event)
{
	var res = JSON.parse(event.data);

	console.log('wsMessage');

	global.wsMessageHandlers.filter(function(e) {
		return e.desktop === res.desktop;
	}).forEach(function(e) {
		setTimeout(function() {
			e.handler(null, res);
		}, 0);
	});
}

function rootWSHandler(err, res) {
	if (err) {
		console.log('root ws handler error: ', err);
		return;
	}

	if (res.desktop !== global.desktopID && res.desktop !== '') {
		console.log('root ws handler received response for desktopID "'+res.desktop+'" which is not the root desktop.');
		return;
	}

	switch(res.type){
	case 'open':
		res.open.files.forEach(function(file) {
			document.getElementById('file-anchor').appendChild(createFile(file, global.desktopID));
		});
		break;
	case 'create_file':
		document.getElementById('file-anchor').appendChild(createFile(res.create_file.file, global.desktopID));
		break;
	case 'create_directory':
		var file = createFile(res.create_directory, global.desktopID);
		document.getElementById('file-anchor').appendChild(file);
		if (res.create_directory.name === 'Neuer Ordner' && document.activeElement.tagName !== 'input') {
			editFilename(file);
		}
		break;
	case 'delete_file':
		deleteFile(res.delete_file.id, res.desktop);
		break;
	case 'move':
		moveFile(res.move.id, res.desktop, res.move.toX, res.move.toY);
		break;
	case 'rename':
		renameFile(res.rename.id, res.desktop, res.rename.newName);
		break;
	case 'error':
		console.log('backend error: ', res.error.text);
		break;
	case 'ping':
		break;
	case 'upload_status':
		if (typeof global.handleUploadEvent === 'function') {
			global.handleUploadEvent(res.upload_status);
		}
		break;

	default:
		console.log('what is : ', res.type);
	}
}

function addWSMessageHandler(desktop, handler) {
	global.wsMessageHandlers.push({
		desktop: desktop,
		handler: handler,
	});
}

function removeWSMessageHandler(desktop, handler) {
	global.wsMessageHandlers = global.wsMessageHandlers.filter(function(e) {
		return e.handler !== handler || e.desktop !== desktop;
	})
}

function wsError(event)
{
	global.wsGood = false;
	console.error(event);
	showDisconnectedLayer();
}

function wsCreateDirectory(name) {
	global.ws.send(JSON.stringify({
		type: 'create_directory',
		desktop: global.desktopID,
		create_directory: {
			name: name,
			type: 'subdesktop',
			x: global.createPos.x,
			y: global.createPos.y,
		}
	}));
}

window.addEventListener('load', function () {
	Array.prototype.forEach.call(document.getElementsByClassName('cm-entry'), function(entry) {
		entry.addEventListener('click', cmActionHandler);
	});

	global.desktopID = window.location.href.substr(window.location.href.lastIndexOf('/')+1);
	global.ws = new WebSocket(window.location.origin.replace('http', 'ws')+'/api/ws');
	global.ws.onopen = wsOpened;
	global.ws.onmessage = wsMessage;
	global.ws.onerror = wsError;
	global.ws.onclose = wsError;
	window.setInterval(function() {
		if (!global.wsGood) 
			return;
		global.ws.send(JSON.stringify({ type: 'ping' }));
	}, 20000);

	if (document.getElementsByClassName('cm-desktop').length !== 0) {
		document.getElementById('outer').addEventListener('contextmenu', fileContextMenuHandler);
	}

// device detection
	if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
	    || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4))) {
		global.isMobile = true;
	}

	console.log('global.isMobile = ', global.isMobile);
});

function fileDragStartHandler(event) {
	if (global.isMobile) {
		return;
	}
	
	var classes = event.target.classList;
	if (!classes.contains('file') || classes.contains('explorer-file')) {
		return;
	}
	var draggedDesktop = getFileDesktop(event.target);
	if (draggedDesktop !== global.desktopID) {
		console.log('draggedDesktop !== global.desktopID');
		return;
	}

	// store a ref. on the dragged elem
	var dragged = event.target;
	global.drag.elem = dragged;
	// make it half transparent
	dragged.style.opacity = .5;

	var r = dragged.getBoundingClientRect();

	global.drag.offsetX = r.left - event.clientX;
	global.drag.offsetY = r.top  - event.clientY;
}

function fileDragEndHandler(event) {
	var dragged = global.drag.elem;
	if (dragged === null)
		return;
	global.drag.elem = null;

	// reset the transparency
	dragged.style.opacity = '';

	var x = event.clientX + global.drag.offsetX;
	var y = event.clientY + global.drag.offsetY;

	console.log(`startX: ${global.drag.startX}  startY: ${global.drag.startY}`);
	console.log(`drag.x: ${global.drag.x}  drag.y: ${global.drag.y}`);
	console.log(`x: ${x} y: ${y}`);

	global.ws.send(JSON.stringify({
		type: 'move',
		desktop: global.desktopID,
		move: {
			id: getFileID(dragged),
			toX: x,
			toY: y,
		},
	}));
}


document.addEventListener("dragstart", fileDragStartHandler);

if (navigator.userAgent.search("Firefox") != -1) {
	// fuckin firefox has to be special
	document.addEventListener("drop", fileDragEndHandler);
} else {
	document.addEventListener("dragend", fileDragEndHandler);
}

function moveFile(id, desktop, x, y)
{
	if (global.isMobile) {
		return;
	}

	var f = document.getElementsByClassName('fileID-'+id)
	if(!f || f.length === 0) {
		return;
	}

	Array.from(f).forEach(function(file) {
		if(file.classList.contains('desktopID-'+desktop) && !file.classList.contains('explorer-file')) {
			file.style.left = x+'px';
			file.style.top = y+'px';
		}
	});
}

function renameFile(id, desktop, newName)
{
	var f = document.getElementsByClassName('fileID-'+id)
	if(!f || f.length === 0) {
		return;
	}

	Array.from(f).forEach(function(file) {
		if(file.classList.contains('desktopID-'+desktop)) {
			setFilename(file, newName)
		}
	});
}

var simpleProgressHUD = {
	elements: [],
	fl: null,
	handle: function(event) {
		var self = simpleProgressHUD;

		if (!self.fl) {
			self.fl = document.getElementById('uploadHUDContainer');
			if (!self.fl)
				return;
		}

		event.uploads.forEach(function(u) {
			var p = document.getElementById('simpleProgressHUD-'+window.btoa(u.uploadID))
			if (!p) {
				if (u.done || u.failed)
					return;
				var p = document.createElement('p');
				p.classList.add('simpleProgressHUD');
				p.id = 'simpleProgressHUD-'+window.btoa(u.uploadID);

				self.fl.append(p);
			}

			if (u.done || u.failed) {
				p.innerText = u.filename+' ... upload '+(u.done ? 'successful' : 'failed');
				setTimeout(function() {
					p.parentElement.removeChild(p);
				}, 1500);
				return;
			}

			p.innerText = u.filename+' ... '+(100.0*u.loaded / u.size).toFixed(1)+'% uploaded ('+u.loaded+'/'+u.size+' bytes)';
		});

		Array.from(document.getElementsByClassName('simpleProgressHUD')).forEach(function(p) {
			var found = false;
			for(let i = 0; i != event.uploads; i++) {
				if ('simpleProgressHUD-'+window.btoa(event.uploads[i].uploadID) === p.id) {
					found = true;
					break;
				}
			}

			if(!found)
				self.fl.removeChild(p);
		});
	},
};

global.handleUploadEvent = simpleProgressHUD.handle;

function showContextMenu(x,y,file) {
	var cm = document.getElementById('contextmenu');
	cm.style.display = 'block';
	cm.style.top = y+'px';
	cm.style.left = x+'px';

	Array.from(document.getElementsByClassName('cm-entry')).forEach(function(e) {
		if (!file) {
			e.style.display = e.classList.contains('cm-desktop') ? 'block' : 'none';
			return;
		}

		if (e.classList.contains('cm-file') && file.classList.contains('directory')) {
			e.style.display = 'none';
			return;
		}
		if (e.classList.contains('cm-directory') && !file.classList.contains('directory')) {
			e.style.display = 'none';
			return;
		}
		e.style.display = 'block';
	});

}

function hideContextMenu() {
	document.getElementById('contextmenu').style.display = 'none';
	global.cmFile = null;
}

function toggleStartMenu() {
	global.startMenu.open = !global.startMenu.open;
	document.getElementById('startmenu').style.display = global.startMenu.open ? 'block' : 'none';
}

window.addEventListener('click', function(event) {
	if(!event.target.classList.contains('contextmenu')) {
		hideContextMenu();
	}
});
