const mimeDb = require('mime-db')
const fs = require('fs')

/**
 * Guardamos archivos multimedia que nuestro cliente nos envie!
 * @param {*} media 
 */


const saveMedia = (media) => {
    const extensionProcess = mimeDb[media.mimetype];
    let ext = extensionProcess?.extensions[0];

    // Added by Abdiel 2023-06-02
    if ( !ext ) { 
        console.warn('No file extension found in function saveMedia in \"/controllers/save.js\"');

        ext = 'xyz';
    }

    fs.writeFile(`./media/${Date.now()}.${ext}`, media.data, { encoding: 'base64' }, function (err) {
        console.log('** Archivo Media Guardado **');
    });
}

module.exports = {saveMedia}