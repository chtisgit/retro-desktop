
function loadAppList() {
	var list = localStorage.getItem('appList');
	if (!list) list = []; else list = JSON.parse(list);
	return list;
}

function saveAppList(list) {
	localStorage.setItem('appList', JSON.stringify(list));
}

function updateStartMenu(list) {
	if (!list) {
		list = loadAppList();
	}
	list.sort(function(lhs, rhs) {
		return lhs.updateTime > rhs.updateTime;
	})

	if (global && global.startMenu) {
		global.startMenu.apps = list;
	}

	var ul = document.getElementById('startmenu-content');

	while (ul.firstChild) {
		ul.removeChild(ul.firstChild);
	}

	for (var i = 0; i !== list.length; i++) {
		var li = document.createElement('li');
		var app = list[i];
		li.innerText = app.name;
		li.classList.add('unselectable');
		li.addEventListener('click', (function(app) {
			return function() {
				startInstalledApp(app.id);
				toggleStartMenu();
			}})(app));

		ul.appendChild(li);
	}
}

function installApp(app) {
	var list = loadAppList();
	var i = list.findIndex(function(elem) {
		return elem.id === app.id;
	});

	var numericId;
	if (i === -1) {
		numericId = list.reduce(function(m, val) {
			return Math.max(m, val);
		}, 0) + 1;

		list.push({
			id: app.id,
			name: app.name,
			numericId: numericId,
			permissions: [],
			installTime: Date.now(),
			updateTime: Date.now(),
		});
	} else {
		list[i].version = app.version;
		list[i].name = app.name;
		list[i].updateTime = Date.now();

		numericId = list[i].numericId;
	}

	saveAppList(list);

	localStorage.setItem(`app-${numericId}`, app.code);
	updateStartMenu(list);

	messageBox('App Installed', `App "${app.name}" has been successfully installed!`);

}

function parseAndInstallApp(code) {
	var app = { code };
	var appidRe = new RegExp('<meta name="application-id" content="([^"]+)">');
	var nameRe = new RegExp('<meta name="application-name" content="([^"]+)">');
	var versionRe = new RegExp('<meta name="application-version" content="([^"]+)">');

	var name = nameRe.exec(app.code);
	if (!name) {
		messageBox('Installation Failed', 'App cannot be installed. Meta field "application-name" not found.');
		return;
	}

	var id = appidRe.exec(app.code);
	if (!id) {
		messageBox('Installation Failed', 'App cannot be installed. Meta field "application-id" not found.');
		return;
	}

	var version = versionRe.exec(app.code);
	if (!version) {
		messageBox('Installation Failed', 'App cannot be installed. Meta field "application-id" not found.');
		return;
	}

	app.id = id[1];
	app.name = name[1];
	app.version = version[1];

	var list = loadAppList();
	var a = list.find(function(elem) {
		return elem.id === app.id;
	});

	if (a) {
		// already installed.

		if (a.version === app.version) {
			messageBox('App Installed', 'This app is already installed.')
			return;
		}

		confirmPrompt('Install Wizard',
			`This app "${app.name}" is already installed. Do you want to remove version ${a.version} and install ${app.version} ?`,
			[
				{ text: 'Yes', callback: function() { installApp(app); } },
				{ text: 'No' },
			]);

		return;
	}

	installApp(app);
}

var installerApp = {
	name: 'Install Wizard',
	start: function(api, file) {
		var install = function() {
			fetch(api.fileContentURL(file), {
				method: 'GET',
			}).then(function(res) {
				var reader = res.body.getReader()

				reader.read().then(editorRead(reader, [], function(data){
					parseAndInstallApp(new TextDecoder().decode(data));
				}));
			});
		};

		confirmPrompt('Install Wizard',
			`Do you really want to install "${file.name}"?`,
			[
				{ text: 'Yes', callback: install },
				{ text: 'No' },
			]);
	},
}

function startInstalledApp(id) {
	var applist = loadAppList();
	var app = applist.find(function(app){ return app.id === id; });
	if (!app) {
		messageBox('App Not Found!', 'No App with this ID was found locally!');
		return;
	}

	var win = guiCreateWindow({
		title: app.name,
		onClose: function(win) {
			var res = win.getElementsByTagName('iframe');
			if (!res) return;
			var iframe = res[0];
			if (!iframe) return;

			appAPI.unregisterRunningApp(iframe.contentWindow);
		},
	});

	var content = win.getElementsByClassName('window-content')[0];

	var iframe = document.createElement('iframe');
	iframe.style.boxSizing = 'border-box';
	iframe.style.width = '100%';
	iframe.style.height = '100%';
	iframe.setAttribute('sandbox', 'allow-scripts');
	iframe.setAttribute('srcdoc', localStorage.getItem(`app-${app.numericId}`));

	iframe.addEventListener('load', function(event) {
		appAPI.registerRunningApp(app, iframe.contentWindow);
	});

	content.appendChild(iframe);
}

var appAPI = {
	running: [],
	exports: [
		'set_window_title',
	],
	findIframe(window) {
		var iframes = Array.from(document.getElementsByTagName('iframe'));
		var iframe = iframes.reduce(function(found, elem) {
			if (found) return found;
			return elem.contentWindow === window ? elem : null;
		}, null);

		return iframe;
	},
	registerRunningApp(app, window) {
		var entry = this.running.find(function(elem) {
			return elem.window === window;
		});
		
		if (entry) {
			throw 'app already registered';
		}

		entry = {
			runID: this.running.reduce(function(m, val) { return Math.max(m, val); }, 0) + 1,
			window: window,
			firstContact: Date.now(),
			app: {
				id: app.id,
				name: app.name,
				version: app.version,
			},
		};
		this.running.push(entry);

		window.postMessage({
			type: 'start',
			app: entry.app,
			runID: entry.runID,
		}, '*')
	},
	unregisterRunningApp(window) {
		var i = appAPI.running.findIndex(function(elem) {
			return elem.window === window;
		});
		if (i === -1) {
			return;
		}

		appAPI.running.splice(i,1);
	},
	set_window_title(title, event) {
		var iframe = this.findIframe(event.source);
		if (!iframe) return {};
		console.log(iframe);
		guiChangeWindowTitle(iframe.parentElement.parentElement, title);
	}
};

function messageHandler(event) {
	var data = event.data;

	// check the source
	var appEntry = appAPI.running.find(function(elem) {
		return elem.window === event.source;
	});
	if (!appEntry) {
		event.source.postMessage({
			callID: data.callID,
			error: 'Call received from unidentified source',
		}, '*');
		return;
	}

	// check the method
	if (appAPI.exports.indexOf(data.method) === -1) {
		event.source.postMessage({
			callID: data.callID,
			error: `no exported API method "${data.method}" found!`,
		}, '*');
		return;
	}

	var f = appAPI[data.method];
	var params = data.parameters || [];
	params.push(event);

	var res;
	try {
		var res = f.apply(appAPI, params);
	} catch (err) {
		console.log(err.stack);
		event.source.postMessage({
			callID: data.callID,
			result: err,
			error: 'the called method threw an error',
		}, '*');
		return;
	}

	event.source.postMessage({
		callID: data.callID,
		result: res,
	}, '*');
}

function initAppAPI () {
	window.addEventListener('message', messageHandler);
}

registerHandler(['app'], installerApp);
updateStartMenu();
initAppAPI();

