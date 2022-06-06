
// This is legacy stuff now...

function explorerize(file)
{
    file.classList.add('explorer-file');
    file.setAttribute('draggable', '');
    return file;
}

var explorerApp = {
    name: 'Explorer',
    start: function(api, directory) {
        var win = guiCreateWindow({
            title: 'Explorer - ' + directory.name
        });

        var content = win.getElementsByClassName('window-content')[0];
        
        var filesArea = document.createElement('div');
        filesArea.classList.add('explorer-files-area');

        content.appendChild(filesArea);

        api.openDesktop(directory.desktop, function(err, res) {
            if (err) {
                console.log('explorer error: ', err);
                return;
            }
            
            switch(res.type){
            case 'open':
                res.open.files.forEach(function(file) {
                    filesArea.appendChild(explorerize(createFile(file, directory.desktop)));
                });
                break;
            case 'create_file':
                filesArea.appendChild(explorerize(createFile(res.create_file.file, directory.desktop)));
                break;
            case 'delete_file':
                deleteFile(res.delete_file.id, directory.desktop);
                break;
            case 'move':
                // ignore positions in explorer.
                break;
            case 'rename':
                renameFile(res.rename.id, directory.desktop, res.rename.newName);
                break;
            case 'error':
                console.log('backend error: ', res.error.text);
                break;
            case 'ping':
                break;
            default:
                console.log('what is : ', res.type);
            }
        });
    }
}

if (global) {
    global.explorer = explorerApp;
}

var imagePreviewApp = {
    name: 'Image Preview',
    start: function(api, file){
        var win = guiCreateWindow({
            title: file.name+' - '+imagePreviewApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];

        var img = document.createElement('img');
        img.alt = 'Image '+file.name;
        img.src = api.fileContentURL(file);
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';

        content.appendChild(img);
    },
}

var videoPreviewApp = {
    name: 'Video Preview',
    start: function(api, file){
        var win = guiCreateWindow({
            title: file.name+' - '+videoPreviewApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];

        var vid = document.createElement('video');
        vid.src = api.fileContentURL(file);
        vid.controls = 'yes';
        vid.setAttribute('autoplay', '');

        vid.style.maxWidth = '100%';
        vid.style.maxHeight = '100%';

        content.appendChild(vid);
    },
}

function editorRead(reader, buffers, cb)
{
    return function(res) {
        if(res.done){
            var len = buffers.map(function(val) {
                return val.length;
            }).reduce(function(acc, val) {
                return acc+val;
            }, 0);
            var data = new Uint8Array(len);
            buffers.forEach(function(val) {
                data.set(val);
            });

            cb(data);

            return;
        }

        buffers.push(res.value);
        setTimeout(function(){
            reader.read().then(editorRead(reader, buffers, cb));
        }, 0);
    }
}

var textEditorApp = {
    name: 'Editor',
    start: function(api, file){
        var win = guiCreateWindow({
            title: file.name+' - '+textEditorApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];
        var textarea = document.createElement('textarea');

				textarea.style.boxSizing = 'border-box';
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.setAttribute('readonly', '');

        fetch(api.fileContentURL(file), {
            method: 'GET',
        }).then(function(res) {
            var reader = res.body.getReader()

            reader.read().then(editorRead(reader, [], function(data){
                textarea.removeAttribute('readonly');
                textarea.value = new TextDecoder().decode(data);
            }));
        });

        content.appendChild(textarea);
    },
}

function registerHandler(exts, handler)
{
    exts.forEach(function(ext) {
        global.fileTypes[ext] = handler;
    });
}

function builtinAppsInit()
{
    if (!global || !global.fileTypes) {
        return;
    }

    registerHandler(['jpg', 'jpeg', 'png', 'gif'], imagePreviewApp);
    registerHandler(['webm', 'mp4', 'm4v', 'ogg'], videoPreviewApp)
    registerHandler(['txt', 'log'], textEditorApp);
}

builtinAppsInit();
