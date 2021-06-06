const fs = require('fs');
const {trimPathRoot, isIgnored} = require('./helpers');

class LocalUtil {
    /**
     * @type {string}
     */
    _basePath;
    /**
     * @type {string[]}
     */
    _ignore;
    /**
     * @type {boolean}
     */
    _verbose;

    _logger;

    /**
     * @param {string} basePath
     * @param {string[]} ignore
     * @param logger
     * @param {boolean} verbose
     */
    constructor(basePath, ignore, logger, verbose = false) {
        this._ignore = ignore;
        this._basePath = basePath;
        this._logger = logger;
        this._verbose = verbose;
    }

    /**
     * @param {string} currentPath
     * @param {function} callback
     */
    walk = (currentPath, callback) => {
        this._logger.debug("walk local started.");
        const result = this._next(currentPath);
        this._logger.debug("walk local complete.");
        callback(null, result);
    }

    /**
     * @private
     * @param {string} currentPath
     * @returns {{files: [], dirs: string[]}}
     */
    _next = (currentPath) => {
        let dirs = [];
        let files = [];

        const list = fs.readdirSync(currentPath);

        list.forEach((item) => {

            const itemFullPath = currentPath + "/" + item;

            // skip ignore files
            const relativePath = trimPathRoot(this._basePath, itemFullPath);
            if (isIgnored(this._ignore, relativePath)) {
                if (this._verbose) {
                    this._logger.info("ignored path: ", relativePath);
                }
                return;
            }

            const itemStat = fs.statSync(itemFullPath);
            // handle directories
            if (itemStat.isDirectory()) {
                // add the directory to the results
                dirs.push(trimPathRoot(this._basePath, itemFullPath));
                // concat results from recursive calls
                const childResult = this._next(itemFullPath);
                dirs = dirs.concat(childResult.dirs);
                files = files.concat(childResult.files);
            }
            // handle files
            else if (itemStat.isFile()) {
                files.push({
                    "id": trimPathRoot(this._basePath, itemFullPath),
                    "size": itemStat.size,
                    "time": new Date(itemStat.ctime)
                });
            }
        });

        return {files, dirs};
    }

    /**
     * @param {string} dir
     * @param {function} callback
     */
    mkdir = (dir, callback) => {
        dir = this._basePath + dir;
        fs.mkdir(dir, {recursive: true}, (err, data) => {
            if (err) {
                this._logger.error("MKDIR failed.");
                return callback(err);
            }
            if (this._verbose) {
                this._logger.info("-", dir, "created successfully");
            }
            callback();
        });
    }

    /**
     * @param {string} dir
     * @param {function} callback
     */
    rmdir = (dir, callback) => {
        dir = this._basePath + dir;
        fs.rmdir(dir, {recursive: true}, (err, data) => {
            if (err) {
                this._logger.error("RMDIR failed.");
                return callback(err);
            }
            if (this._verbose) {
                this._logger.info("-", dir, "deleted successfully");
            }
            callback();
        })
    }

    /**
     * @param {string} file
     * @param {function} callback
     */
    remove = (file, callback) => {
        file = this._basePath + file;
        fs.unlink(file, (err, data) => {
            if (err) {
                this._logger.error("Remove failed.");
                return callback(err);
            }
            if (this._verbose) {
                this._logger.info("-", file, "deleted successfully");
            }
            callback(null, file);
        });
    }
}

module.exports = LocalUtil;
