const minimatch = require("minimatch");
const helpers = {

    // trims the base dir of from the file path
    trimPathRoot: function (root, path) {
        let rootDirs = root.split("/");
        let pathDirs = path.split("/");
        return "/" + pathDirs.splice((rootDirs.length), (pathDirs.length - rootDirs.length)).join("/");
    },

    /**
     * @param {string[]} ignores
     * @param {string} path
     * @returns {boolean}
     */
    isIgnored: (ignores, path) => {
        for (let i = 0; i < ignores.length; i++) {
            if (minimatch(path, ignores[i], {matchBase: true})) {
                return true;
            }
        }
        return false;
    }
}

module.exports = helpers;
