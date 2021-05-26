const helpers = {

    // trims the base dir of from the file path
    trimPathRoot: function (root, path) {
        let rootDirs = root.split("/");
        let pathDirs = path.split("/");
        return "/" + pathDirs.splice((rootDirs.length), (pathDirs.length - rootDirs.length)).join("/");
    }
}

module.exports = helpers;
