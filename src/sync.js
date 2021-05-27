const BasicFTP = require("basic-ftp");
const async = require("async");
const LocalUtil = require("./local-util");
const RemoteUtil = require("./remote-util");

class Sync {
    settings;
    ftpConnectionConfig;

    /**
     * @type {Client}
     */
    ftpConnection = null;

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

    totalDownloadSize = 0;
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
        };

        this.ftpConnectionConfig = {
            "host": config.host,
            "port": config.port || 21,
            "user": config.user || "anonymous",
            "password": config.pass || "guest",
            keepalive: 30000,
        }

        // create the ftp instance
        this.ftpConnection = new BasicFTP.Client();

        this.logger = logger;
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

        //this.ftpConnection.ftp.verbose = this.settings.verbose;
        this.ftpConnection.access(this.ftpConnectionConfig).then(() => {
            this.localUtil = new LocalUtil(this.settings.local, this.settings.ignore, this.logger, this.settings.verbose);
            this.remoteUtil = new RemoteUtil(this.ftpConnection, this.settings.remote, this.settings.local, this.settings.ignore, this.logger, this.settings.verbose);
            this.logger.debug("Setup complete.");
            callback(null);
        }).catch((err) => {
            this.logger.error("Setup failed.", err);
            callback("error", err);
        })
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
        this.totalDownloadSize = 0;
        this.totalNumOfChanges = 0;
        this.logger.debug("Consolidating");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }

        this.consolidateDirectories(this.remote.dirs, this.local.dirs);

        //if directory will be removed we can skip files located in those directories.
        const localFiles = this.filtersFilesInGivenDirs(this.local.files, this.rmdirQueue);

        this.consolidateFiles(this.remote.files, localFiles);
        this.totalDownloadSize = this.calculateTotalDownloadSize();
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
        async.series([
                // add directories
                this.processMkdirQueue,
                // add files
                this.processAddFileQueue,
                // update files
                this.processUpdateQueue,
                // remove dirs
                this.processRemoveDirQueue,
                // remove files
                this.processRemoveFileQueue,
            ],
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

    getUpdateStatus = () => {
        return {
            numOfChanges: this.totalNumOfChanges,
            numOfLocalFiles: this.local.files.length,
            numOfRemoteFiles: this.remote.files.length,
            totalDownloadSize: this.totalDownloadSize,
            totalDownloadedSize: this.remoteUtil.totalDownloadedSize,
            totalLocalSize: this.totalLocalSize,
            totalRemoteSize: this.totalRemoteSize,
        }
    }

    reset = () => {
        this.totalNumOfChanges = 0;
        this.totalLocalSize = 0;
        this.totalRemoteSize = 0;
        this.remoteUtil.totalDownloadedSize = 0;
        this.local = {
            files: [],
            dirs: [],
        };
        this.remote = {
            files: [],
            dirs: [],
        };
        this.ftpConnection.close();
    }

    /**
     * @private
     */
    processMkdirQueue = (callback) => {
        if (this.mkdirQueue.length === 0) {
            callback(null, "no mkdirs");
            return;
        }
        async.mapLimit(this.mkdirQueue, this.settings.connections, this.localUtil.mkdir, (err) => {
            if (err) {
                this.logger.error("MKDIRs failed.");
                return callback(err);
            }
            this.logger.debug("MKDIRs complete.");
            callback(null);
        });
    }

    /**
     * @private
     */
    processAddFileQueue = (callback) => {
        if (this.addFileQueue.length === 0) {
            callback(null, "no additions");
            return;
        }
        async.mapLimit(this.addFileQueue, this.settings.connections, this.remoteUtil.download, (err) => {
            if (err) {
                this.logger.error("Additions failed.");
                return callback(err);
            }
            this.logger.debug("Additions complete.");
            callback(null);
        });
    }

    /**
     * @private
     */
    processUpdateQueue = (callback) => {
        if (this.updateFileQueue.length === 0) {
            callback(null, "no updates");
            return;
        }
        async.mapLimit(this.updateFileQueue, this.settings.connections, this.remoteUtil.download, (err) => {
            if (err) {
                this.logger.error("Updates failed.");
                return callback(err);
            }
            this.logger.debug("Updates complete.");
            callback(null);
        });
    }

    /**
     * @private
     */
    processRemoveFileQueue = (callback) => {
        if (this.removeFileQueue.length === 0) {
            callback(null, "no removals");
            return;
        }
        async.mapLimit(this.removeFileQueue, this.settings.connections, this.localUtil.remove, (err) => {
            if (err) {
                this.logger.error("Removals failed.");
                return callback(err);
            }
            this.logger.debug("Removals complete");
            callback(null);
        });
    }

    /**
     * @private
     */
    processRemoveDirQueue = (callback) => {
        if (this.rmdirQueue.length === 0) {
            callback(null, "no rmdirs");
            return;
        }
        async.mapLimit(this.rmdirQueue, this.settings.connections, this.localUtil.rmdir, (err) => {
            if (err) {
                this.logger.error("RMDIRs failed.", err);
                return callback(err);
            }
            this.logger.debug("RMDIRs complete.");
            callback(null);
        });
    }

    /**
     * creates list of directories to be created and removed by comparing remote and local directories
     * @private
     * @param {string[]} remoteDirs
     * @param {string[]} localDirs
     */
    consolidateDirectories(remoteDirs, localDirs) {

        // compare directories for modifications
        remoteDirs.forEach((dir) => {
            // if a match is found
            let lIDX = localDirs.indexOf(dir);
            if (lIDX !== -1) {
                let rIDX = remoteDirs.indexOf(dir);
                localDirs[lIDX] = "";
                remoteDirs[rIDX] = "";
            }
        });

        // process the rest
        let rmdirQueue = localDirs.filter((dir) => dir !== "");
        this.mkdirQueue = remoteDirs.filter((dir) => dir !== "");

        this.rmdirQueue = this.filtersSubDirsFromArray(rmdirQueue);
    }

    /**
     * creates list of files to be added and removed by comparing remote and local files
     * @private
     * @param {*[]} remoteFiles
     * @param {*[]} localFiles
     */
    consolidateFiles(remoteFiles, localFiles) {

        const processedLocalFileIndexes = [];
        // compare files for modifications
        remoteFiles.forEach((rFile, rIDX) => {
            let lIDX = localFiles.findIndex((f) => (f.id === rFile.id));
            // if a match is found
            if (lIDX !== -1) {
                const lFile = localFiles[lIDX];
                if (Sync.isDifferent(lFile, rFile) ||
                    Sync.isModified(lFile, rFile)) {
                    this.updateFileQueue.push(rFile);
                }
                // mark updates as processed

                processedLocalFileIndexes.push(lIDX);
            } else {
                this.addFileQueue.push(rFile);
            }
        });

        this.removeFileQueue = localFiles.filter((f, index) => !processedLocalFileIndexes.includes(index));
    }

    /**
     * if there is subdirectories they will be removed.
     * for example if there are ["/dir1", "/parent", "/parent/child", "/parent/child2", "/parent/child/sub-child"]
     * result will be ["/dir1", "/parent"]
     * @private
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
     * @private
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
     * @private
     * @return {number}
     */
    calculateTotalDownloadSize = () => {
        let total = 0;
        total += this.sumFileSizes(this.addFileQueue);
        total += this.sumFileSizes(this.updateFileQueue);

        return total;
    }

    /**
     * @private
     * @param {{size: number}[]} files
     * @return {number}
     */
    sumFileSizes = (files) => {
        return files.reduce((prev, curr) => prev + curr.size, 0);
    }

    /**
     * @private
     * @return {number}
     */
    calculateTotalNumberOfChanges = () => {
        return this.removeFileQueue.length + this.rmdirQueue.length + this.addFileQueue.length + this.removeFileQueue.length + this.updateFileQueue.length;
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

    /**
     * compare a local vs remote file time for modification
     *
     * @param localFile
     * @param remoteFile
     * @returns {boolean} return TRUE if remote file's modified date is later than local file's
     */
    static isModified = (localFile, remoteFile) => {
        // round to the nearest minute
        const minutes = 1000 * 60;
        const lTime = new Date((Math.round(localFile.time.getTime() / minutes) * minutes));
        const rTime = new Date((Math.round(remoteFile.time.getTime() / minutes) * minutes));

        return lTime < rTime;
    }
}

module.exports = Sync;
