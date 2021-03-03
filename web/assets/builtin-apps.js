
var imagePreviewApp = {
    name: 'Image Preview',
    start: function(api, file){
        var win = guiCreateWindow({
            title: file.name+' - '+imagePreviewApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];

        var img = document.createElement('img');
        img.alt = 'Image '+file.name;
        img.src = api.fileContentURL(file.id);
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
        vid.src = api.fileContentURL(file.id);
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

        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.setAttribute('readonly', '');

        fetch(api.fileContentURL(file.id), {
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