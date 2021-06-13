const async = require("async");
const LocalUtil = require("./local-util");
const RemoteUtil = require("./remote-util");

class BaseSync {
    settings;
    ftpConnectionConfig;

    /**
     * @type {{dirs: *[], files: *[]}}
     */
    local = {
        dirs: [],
        files: []
    };
    /**
     * @type {{dirs: *[], files: *[]}}
     */
    remote = {
        dirs: [],
        files: []
    };

    /**
     * @type {string[]}
     */
    mkdirQueue = [];
    /**
     * @type {string[]}
     */
    rmdirQueue = [];
    /**
     * @type {{id: string, size: number, time: Date}[]}
     */
    addFileQueue = [];
    /**
     * @type {{id: string, size: number, time: Date}[]}
     */
    updateFileQueue = [];
    /**
     * @type {{id: string, size: number, time: Date}[]}
     */
    removeFileQueue = [];

    totalTransferSize = 0;
    totalNumOfChanges = 0;
    totalLocalSize = 0;
    totalRemoteSize = 0;

    logger;

    constructor(config, logger) {
        this.settings = {
            "local": config.local || process.cwd(),
            "remote": config.remote || "/",
            "ignore": config.ignore || [],
            //TODO more than 1 connection causes error: "User launched a task while another one is still running"
            "connections": config.connections || 1,
            "verbose": config.verbose || false,
            "retryLimit": config.retryLimit || 3,
        };

        this.ftpConnectionConfig = {
            "host": config.host,
            "port": config.port || 21,
            "user": config.user || "anonymous",
            "password": config.pass || "guest",
            keepalive: 30000,
        }

        this.logger = logger;

        this.localUtil = new LocalUtil(this.settings.local, this.settings.ignore, this.logger, this.settings.verbose);
        this.remoteUtil = new RemoteUtil(this.ftpConnectionConfig, this.settings.remote, this.settings.local, this.settings.ignore, this.logger, this.settings.retryLimit, this.settings.verbose);
    }

    /**
     * compare local vs remote file sizes
     * @param localFile
     * @param remoteFile
     *
     * @returns {boolean}
     */
    static isDifferent = (localFile, remoteFile) => {
        return localFile.size !== remoteFile.size;
    }

    setUp = (callback) => {
        this.logger.debug("Setup");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }

        // display the settings
        if (this.settings.verbose) {
            this.logger.info("Settings:", this.settings);
        }

        this.remoteUtil.setUpConnection().then(() => {
            this.logger.debug("Setup complete.");
            callback(null);
        }).catch((err) => {
            this.logger.error("Setup failed.", err);
            callback("error", err);
        });
    }

    collect = (callback) => {
        this.totalLocalSize = 0;
        this.totalRemoteSize = 0;
        this.local = {
            dirs: [],
            files: []
        };
        this.remote = {
            dirs: [],
            files: []
        };
        this.logger.debug("Collecting");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }
        // fetch the file listings
        async.series([
            (callback) => {
                this.localUtil.walk(this.settings.local, callback);
            },
            (callback) => {
                this.remoteUtil.walk(this.settings.remote, callback);
            }
        ], (err, results) => {
            if (err) {
                this.logger.error("Collection failed.");
                return callback(err);
            }
            // store the values for later
            this.local = results[0];
            this.remote = results[1];

            this.totalLocalSize = this.sumFileSizes(this.local.files);
            this.totalRemoteSize = this.sumFileSizes(this.remote.files);

            if (this.settings.verbose) {
                this.logger.info("Local:", this.local);
                this.logger.info("Remote:", this.remote);
            }
            this.logger.debug("Collection complete.");
            callback(null);
        });
    }

    consolidate = (callback) => {
        this.totalTransferSize = 0;
        this.totalNumOfChanges = 0;
        this.logger.debug("Consolidating");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }

        this.consolidateDirectories(this.remote.dirs, this.local.dirs);

        this.consolidateFiles(this.remote.files, this.local.files);
        this.totalTransferSize = this.calculateTotalTransferSize();
        this.totalNumOfChanges = this.calculateTotalNumberOfChanges();

        this.logger.debug(`Mkdir ${this.mkdirQueue.length} directories:`);
        this.logger.debug(`Rmdir ${this.rmdirQueue.length} directories:`);
        this.logger.debug(`Add ${this.addFileQueue.length} files:`);
        this.logger.debug(`Updates ${this.updateFileQueue.length} files`);
        this.logger.debug(`Remove ${this.removeFileQueue.length} files`);
        this.logger.debug("Consolidate status", this.getUpdateStatus());

        // log the results
        if (this.settings.verbose) {
            this.logger.info("Make dir queue", this.mkdirQueue);
            this.logger.info("Remove dir queue", this.rmdirQueue);
            this.logger.info("Add file queue", this.addFileQueue);
            this.logger.info("Update file queue", this.updateFileQueue);
            this.logger.info("Remove file queue", this.removeFileQueue);
        }
        this.logger.debug("Consolidation complete.");
        callback(null);
    }

    commit = (callback) => {
        this.logger.debug("Committing");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }
        async.series(this.commitCmdQueue,
            (err, results) => {
                if (err) {
                    this.logger.error("Commit failed.", err);
                    return callback(err);
                }
                this.logger.debug("Commit complete.");
                callback(null);
            });
    }

    run = (callback) => {
        return async.series([
            // setup
            this.setUp,
            // collect
            this.collect,
            // consolidate
            this.consolidate,
            // commit
            this.commit,
        ], callback);
    }

    getUpdateStatus() {
        return {
            numOfChanges: this.totalNumOfChanges,
            numOfLocalFiles: this.local.files.length,
            numOfRemoteFiles: this.remote.files.length,
            totalLocalSize: this.totalLocalSize,
            totalRemoteSize: this.totalRemoteSize,
            totalTransferSize: this.totalTransferSize,
        }
    }

    reset = () => {
        this.totalNumOfChanges = 0;
        this.totalLocalSize = 0;
        this.totalRemoteSize = 0;
        this.remoteUtil.totalDownloadedSize = 0;
        this.remoteUtil.totalUploadedSize = 0;
        this.local = {
            files: [],
            dirs: [],
        };
        this.remote = {
            files: [],
            dirs: [],
        };
    }

    /**
     * @protected
     * @returns {Function[]}
     */
    get commitCmdQueue() {
        return [];
    }

    /**
     * @protected
     */
    processMkdirQueue = (callback) => {
        callback(null);
    }

    /**
     * @protected
     */
    processAddFileQueue = (callback) => {
        callback(null);
    }

    /**
     * @protected
     */
    processUpdateQueue = (callback) => {
        callback(null);
    }

    /**
     * @protected
     */
    processRemoveFileQueue = (callback) => {
        callback(null);
    }

    /**
     * @protected
     */
    processRemoveDirQueue = (callback) => {
        callback(null);
    }

    /**
     * marks common directories
     * @protected
     * @param {string[]} remoteDirs
     * @param {string[]} localDirs
     */
    consolidateDirectories(remoteDirs, localDirs) {

        remoteDirs.forEach((dir, rIDX) => {
            // if a match is found
            const lIDX = localDirs.indexOf(dir);
            if (lIDX !== -1) {
                localDirs[lIDX] = "";
                remoteDirs[rIDX] = "";
            }
        });
    }

    /**
     * creates list of files to be added and removed by comparing remote and local files
     * @protected
     * @param {*[]} remoteFiles
     * @param {*[]} localFiles
     */
    consolidateFiles(remoteFiles, localFiles) {
    }

    /**
     * if there is subdirectories they will be removed.
     * for example if there are ["/dir1", "/parent", "/parent/child", "/parent/child2", "/parent/child/sub-child"]
     * result will be ["/dir1", "/parent"]
     * @protected
     * @param {string[]} dirs
     */
    filtersSubDirsFromArray(dirs) {
        dirs = dirs.sort();

        const filteredRmDir = [];

        for (let i = 0; i < dirs.length; i++) {
            const currentDir = dirs[i];
            let nextDir = dirs[i+1];
            filteredRmDir.push(currentDir);
            while (nextDir && nextDir.startsWith(currentDir + "/") &&  i < dirs.length - 1) {
                i++;
                nextDir = dirs[i+1];
            }
        }

        return filteredRmDir;
    }

    /**
     * files that are located in given dir list will be filtered.
     * @protected
     * @param {*[]} files
     * @param {string[]} dirs
     *
     * @return {*[]} files
     */
    filtersFilesInGivenDirs(files, dirs) {

        if (!dirs.length) {
            return files;
        }

        files = files.sort();

        const filteredFiles = [];

        files.forEach((currentFile) => {
            let fileIsInGivenDirList = false;
            for (let i = 0; i < dirs.length && !fileIsInGivenDirList; i++) {
                fileIsInGivenDirList = currentFile.id.startsWith(dirs[i] + "/");
            }
            if (!fileIsInGivenDirList) {
                filteredFiles.push(currentFile)
            }
        });

        return filteredFiles;
    }

    /**
     * calculates total download/upload size
     * @protected
     * @return {number}
     */
    calculateTotalTransferSize = () => {
        let total = 0;
        total += this.sumFileSizes(this.addFileQueue);
        total += this.sumFileSizes(this.updateFileQueue);

        return total;
    }

    /**
     * @protected
     * @param {{size: number}[]} files
     * @return {number}
     */
    sumFileSizes = (files) => {
        return files.reduce((prev, curr) => prev + curr.size, 0);
    }

    /**
     * @protected
     * @return {number}
     */
    calculateTotalNumberOfChanges = () => {
        return this.removeFileQueue.length + this.rmdirQueue.length + this.addFileQueue.length + this.updateFileQueue.length;
    }

    /**
     * @protected
     */
    doProcessMkdirQueue = (callback, mkDirFn) => {
        if (this.mkdirQueue.length === 0) {
            callback(null, "no mkdirs");
            return;
        }
        this.logger.debug("mkdirs started.");
        async.mapLimit(this.mkdirQueue, this.settings.connections, mkDirFn, (err) => {
            if (err) {
                this.logger.error("mkdirs failed.");
                return callback(err);
            }
            this.logger.debug("mkdirs complete.");
            callback(null);
        });
    }

    /**
     * @protected
     */
    doProcessAddFileQueue = (callback, addFileFn) => {
        if (this.addFileQueue.length === 0) {
            callback(null, "no additions");
            return;
        }
        this.logger.debug("Additions started.");
        async.mapLimit(this.addFileQueue, this.settings.connections, addFileFn, (err) => {
            if (err) {
                this.logger.error("Additions failed.");
                return callback(err);
            }
            this.logger.debug("Additions complete.");
            callback(null);
        });
    }

    /**
     * @protected
     */
    doProcessUpdateQueue = (callback, updateFileFn) => {
        if (this.updateFileQueue.length === 0) {
            callback(null, "no updates");
            return;
        }
        this.logger.debug("Updates started.");
        async.mapLimit(this.updateFileQueue, this.settings.connections, updateFileFn, (err) => {
            if (err) {
                this.logger.error("Updates failed.");
                return callback(err);
            }
            this.logger.debug("Updates complete.");
            callback(null);
        });
    }

    /**
     * @protected
     */
    doProcessRemoveFileQueue = (callback, rmFileFn) => {
        if (this.removeFileQueue.length === 0) {
            callback(null, "no removals");
            return;
        }
        this.logger.debug("Removals started.");
        async.mapLimit(this.removeFileQueue, this.settings.connections, rmFileFn, (err) => {
            if (err) {
                this.logger.error("Removals failed.");
                return callback(err);
            }
            this.logger.debug("Removals complete");
            callback(null);
        });
    }

    /**
     * @protected
     */
    doProcessRemoveDirQueue = (callback, rmDirFn) => {
        if (this.rmdirQueue.length === 0) {
            callback(null, "no rmdirs");
            return;
        }
        this.logger.debug("rmdirs started.");
        async.mapLimit(this.rmdirQueue, this.settings.connections, rmDirFn, (err) => {
            if (err) {
                this.logger.error("rmdirs failed.", err);
                return callback(err);
            }
            this.logger.debug("rmdirs complete.");
            callback(null);
        });
    }
}

module.exports = BaseSync;
