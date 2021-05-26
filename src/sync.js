const BasicFTP = require("basic-ftp");
const async = require("async");
const LocalUtil = require("./local-util");
const RemoteUtil = require("./remote-util");

class Sync {
    settings;

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

    mkdirQueue = [];
    rmdirQueue = [];
    addQueue = [];
    updateQueue = [];
    removeFileQueue = [];

    logger;

    constructor(config, logger) {
        this.settings = {
            "host": config.host,
            "port": config.port || 21,
            "user": config.user || "anonymous",
            "pass": config.pass || "guest",
            "local": config.local || process.cwd(),
            "remote": config.remote || "/",
            "ignore": config.ignore || [],
            //TODO more than 1 connection causes error: "User launched a task while another one is still running"
            "connections": config.connections || 1,
            "verbose": config.verbose || false,
        };

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

        // create the ftp instance
        this.ftpConnection = new BasicFTP.Client();
        //this.ftpConnection.ftp.verbose = this.settings.verbose;
        this.ftpConnection.access({
            host: this.settings.host,
            port: this.settings.port,
            user: this.settings.user,
            password: this.settings.pass,
            keepalive: 30000,
        }).then(() => {
            this.logger.debug("Setup complete.");
            this.localUtil = new LocalUtil(this.settings.local, this.settings.ignore, this.logger, this.settings.verbose);
            this.remoteUtil = new RemoteUtil(this.ftpConnection, this.settings.remote, this.settings.local, this.settings.ignore, this.logger, this.settings.verbose);
            callback(null);
        }).catch((err) => {
            this.logger.error("Setup failed.");
            callback("error", err);
        })
    }

    collect = (callback) => {
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

            if (this.settings.verbose) {
                this.logger.info("Local:", this.local);
                this.logger.info("Remote:", this.remote);
            }
            this.logger.debug("Collection complete.");
            callback(null);
        });
    }

    consolidate = (callback) => {
        this.logger.debug("Consolidating");
        if (this.settings.verbose) {
            this.logger.info("-------------------------------------------------------------");
        }

        this.consolidateDirectories(this.remote.dirs, this.local.dirs);

        //if directory will be removed we can skip files located in those directories.
        const localFiles = this.filtersFilesInGivenDirs(this.local.files, this.rmdirQueue);

        this.consolidateFiles(this.remote.files, localFiles);
        this.logger.debug(`Mkdir ${this.mkdirQueue.length} directories:`);
        this.logger.debug(`Rmdir ${this.rmdirQueue.length} directories:`);
        this.logger.debug(`Add ${this.addQueue.length} files:`);
        this.logger.debug(`Updates ${this.updateQueue.length} files`);
        this.logger.debug(`Remove ${this.removeFileQueue.length} files`);

        // log the results
        if (this.settings.verbose) {
            this.logger.info('Make dir queue', this.mkdirQueue);
            this.logger.info('Remove dir queue', this.rmdirQueue);
            this.logger.info('Add file queue', this.addQueue);
            this.logger.info('Update file queue', this.updateQueue);
            this.logger.info('Remove file queue', this.removeFileQueue);
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
        if (this.addQueue.length === 0) {
            callback(null, "no additions");
            return;
        }
        async.mapLimit(this.addQueue, this.settings.connections, this.remoteUtil.download, (err) => {
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
        if (this.updateQueue.length === 0) {
            callback(null, "no updates");
            return;
        }
        async.mapLimit(this.updateQueue, this.settings.connections, this.remoteUtil.download, (err) => {
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
        // prepare the files lists for comparison
        let remoteFilePaths = remoteFiles.map((file) => file.id);
        let localFilePaths = localFiles.map((file) => file.id);

        // compare files for modifications
        remoteFilePaths.forEach((file) => {
            let lIDX = localFilePaths.indexOf(file);
            // if a match is found
            if (lIDX !== -1) {
                const rIDX = remoteFilePaths.indexOf(file);
                const lFile = localFiles[lIDX];
                const rFile = this.remote.files[rIDX];
                if (Sync.isDifferent(lFile, rFile) ||
                    Sync.isModified(lFile, rFile)) {
                    this.updateQueue.push(file);
                }
                // mark updates as processed
                localFilePaths[lIDX] = "";
                remoteFilePaths[rIDX] = "";
            }
        });

        this.removeFileQueue = localFilePaths.filter((f) => f !== "");
        this.addQueue = remoteFilePaths.filter((f) => f !== "");
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
