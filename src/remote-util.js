const BasicFTP = require("basic-ftp");
const {trimPathRoot, isIgnored} = require("./helpers");

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
    _retryLimit;

    /**
     * @param {object} ftpConfig FTP connection
     * @param {string} basePath path on remote connection
     * @param {string} localBasePath path on local device
     * @param {string[]} ignore list of ignored paths
     * @param logger
     * @param {int} retryLimit
     * @param {boolean} verbose
     */
    constructor(ftpConfig, basePath, localBasePath, ignore, logger, retryLimit = 3, verbose = false) {
        this._ignore = ignore;
        this._localBasePath = localBasePath;
        this._ftpConfig = ftpConfig;
        this._retryLimit = retryLimit;
        // create the ftp instance
        this._ftp = new BasicFTP.Client();
        //this._ftp.ftp.verbose = verbose;
        this._basePath = basePath;
        this._logger = logger;
        this._verbose = verbose;
    }

    walk = (dir, callback) => {
        this._logger.debug("walk remote started.");
        this._next(dir).then((result) => {
            this._logger.debug("walk remote complete.");
            callback(null, result);
        }).catch((e) => {
            this._logger.error("walk remote failed.", e);
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
        let list = await this.ftpList(currentPath);

        for (let i = 0; i < list.length; i++) {

            const item = list[i];
            const itemFullPath = currentPath + "/" + item.name;

            // skip ignore files
            const relativePath = trimPathRoot(this._basePath, itemFullPath);
            if (isIgnored(this._ignore, relativePath)) {
                if (this._verbose) {
                    this._logger.info("ignored path: ", relativePath);
                }
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

    async setUpConnection() {

        const accessFn = this._ftp.access.bind(this._ftp, this._ftpConfig);
        return await this.retryConnect(accessFn, this._retryLimit);
    }

    async ftpList(currentPath) {
        const listFn = this._ftp.list.bind(this._ftp, currentPath);
        return await this.retry(listFn, this._retryLimit);
    }

    async ftpDownloadTo(remote, local) {
        const downloadFn = this._ftp.downloadTo.bind(this._ftp, remote, local);
        return await this.retry(downloadFn, this._retryLimit);
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

        this.ftpDownloadTo(remote, local).then(() => {
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

    /**
     * retries to open FTP connection given times until it resolves.
     * FTP connections often faces with "ETIMEDOUT" error,
     * that is why we need to retry when we get this error
     * @private
     * @param {Function} fn
     * @param {number} retries
     * @param err
     * @return {Promise}
     */
    retryConnect = (fn, retries= 3, err= null) => {
        if (err) {
            this._logger.error('FTP error', err);
            if ("ETIMEDOUT" !== err.code) {
                return Promise.reject(err);
            }
        }
        if (!retries) {
            return Promise.reject(err);
        }
        return fn().catch(async (err) => {
            return this.retryConnect(fn, (retries - 1), err);
        });
    }

    /**
     * runs FTP function given times until it resolves.
     * FTP connections often faces with "ETIMEDOUT" error,
     * that is why we need to retry when we get this error
     * @private
     * @param {Function} fn
     * @param {number} retries
     * @param err
     * @return {Promise}
     */
    retry = (fn, retries= 3, err=null) => {
        if (err) {
            this._logger.error('FTP error', JSON.stringify(err));
            if ("ETIMEDOUT" !== err.code) {
                return Promise.reject(err);
            }
        }
        if (!retries) {
            return Promise.reject(err);
        }
        return fn().catch(async (err) => {
            await this.setUpConnection();
            return this.retry(fn, (retries - 1), err);
        });
    }
}

module.exports = RemoteUtil;
