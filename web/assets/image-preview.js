
var imagePreviewApp = {
    name: 'Image Preview',
    start: function(file){
        var win = guiCreateWindow({
            title: file.name+' - '+imagePreviewApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];

        var img = document.createElement('img');
        img.alt = 'Image '+file.name;
        img.src = '/api/desktop/'+global.desktopID+'/file/'+file.id+'/content';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';

        content.appendChild(img);
    },
}

var videoPreviewApp = {
    name: 'Video Preview',
    start: function(file){
        var win = guiCreateWindow({
            title: file.name+' - '+videoPreviewApp.name
        });

        var content = win.getElementsByClassName('window-content')[0];        

        var vid = document.createElement('video');
        vid.src = '/api/desktop/'+global.desktopID+'/file/'+file.id+'/content';
        vid.controls = 'yes';
        vid.setAttribute('autoplay', '');

        vid.style.maxWidth = '100%';
        vid.style.maxHeight = '100%';

        content.appendChild(vid);
    },
}


function imageViewerInit()
{
    if (!global || !global.fileTypes) {
        return;
    }

    ['jpg', 'jpeg', 'png', 'gif'].forEach(function(ext){
        global.fileTypes[ext] = imagePreviewApp;
    });
    ['webm', 'mp4', 'm4v', 'ogg'].forEach(function(ext){
        global.fileTypes[ext] = videoPreviewApp;
    });
}


imageViewerInit();