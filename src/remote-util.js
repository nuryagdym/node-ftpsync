const minimatch = require("minimatch");
const BasicFTP = require("basic-ftp");
const {trimPathRoot} = require("./helpers");

class RemoteUtil {

    /**
     * @type {Client}
     */
    _ftp;
    /**
     * @type {string}
     */
    _basePath;
    /**
     * @type {string}
     */
    _localBasePath;
    /**
     * @type {string[]}
     */
    _ignore;
    /**
     * @type {boolean}
     */
    _verbose;
    _logger;

    totalDownloadedSize = 0;

    /**
     * @param {Client} ftp FTP connection
     * @param {string} basePath path on remote connection
     * @param {string} localBasePath path on local device
     * @param {string[]} ignore list of ignored paths
     * @param logger
     * @param {boolean} verbose
     */
    constructor(ftp, basePath, localBasePath, ignore, logger, verbose = false) {
        this._ignore = ignore;
        this._localBasePath = localBasePath;
        this._ftp = ftp;
        this._basePath = basePath;
        this._logger = logger;
        this._verbose = verbose;
    }

    walk = (dir, callback) => {
        this._next(dir).then((result) => {
            callback(null, result);
        }).catch((e) => {
            this._logger.error(e);
            callback("error");
        });
    }


    /**
     * recursively walks over directories
     * @private
     *
     * @param {string} currentPath
     * @returns {Promise<{files: [], dirs: []}>}
     */
    _next = async (currentPath) => {
        let dirs = [];
        let files = [];

        // walk the directory
        const list = await this._ftp.list(currentPath);

        for (let i = 0; i < list.length; i++) {

            const item = list[i];
            const itemFullPath = currentPath + "/" + item.name;

            // skip ignore files
            if (this.isIgnored(trimPathRoot(this._basePath, itemFullPath))) {
                continue;
            }

            // handle directories
            if (item.type === BasicFTP.FileType.Directory) {

                // add the directory to the results
                dirs.push(trimPathRoot(this._basePath, itemFullPath));
                // concat results from recursive calls
                const childResult = await this._next(itemFullPath);
                dirs = dirs.concat(childResult.dirs);
                files = files.concat(childResult.files);
            }
            // handle files
            else if (item.type === BasicFTP.FileType.File) {
                // add the file to the results
                files.push({
                    "id": trimPathRoot(this._basePath, itemFullPath),
                    "size": +item.size,
                    "time": new Date(item.rawModifiedAt)
                });
            }
        }
        return {files, dirs};
    }

    /**
     * @param {{id: string, size: number}} file
     * @param {function} callback
     * download a file from the remote server
     */
    download = (file, callback) => {
        const local = this._basePath + file.id;
        const remote = this._localBasePath + file.id;
        if (this._verbose) {
            this._logger.info("downloading: ", local, remote);
        }
        this._ftp.downloadTo(remote, local).then(() => {
            if (this._verbose) {
                this._logger.info("-", file.id, "downloaded successfully");
            }
            this.totalDownloadedSize += file.size;
            callback(null, file);
        }).catch((err) => {
            this._logger.error("ftp.get failed.", err);
            callback(err);
        });
    }

    isIgnored = (path) => {
        for (let i = 0, len = this._ignore.length; i < len; i++) {
            if (minimatch(path, this._ignore[i], {matchBase: true})) {
                if (this._verbose) {
                    this._logger.info("ignored path: ", path);
                }
                return true;
            }
        }
        return false;
    }
}

module.exports = RemoteUtil;
