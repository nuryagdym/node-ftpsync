const BaseSync = require("./base-sync");

/**
 * synchronizes remote files to local files.
 */
class Rem2LocSync extends BaseSync {

    /**
     * compare a local vs remote file time for modification
     *
     * @param {{time: Date}} localFile
     * @param {{time: Date}} remoteFile
     * @returns {boolean} return TRUE if remote file's modified date is later than local file's
     */
    static isModified = (localFile, remoteFile) => {
        return localFile.time.getTime() < remoteFile.time.getTime();
    }

    getUpdateStatus() {
        const status = super.getUpdateStatus();
        status.totalTransferredSize = this.remoteUtil.totalDownloadedSize;

        return status;
    }

    /**
     * @protected
     * @returns {Function[]}
     */
    get commitCmdQueue() {
        return [
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
        ];
    }

    /**
     * @protected
     */
    processMkdirQueue = (callback) => {
        this.doProcessMkdirQueue(callback, this.localUtil.mkdir);
    }

    /**
     * @protected
     */
    processAddFileQueue = (callback) => {
        this.doProcessAddFileQueue(callback, this.remoteUtil.download);
    }

    /**
     * @protected
     */
    processUpdateQueue = (callback) => {
        this.doProcessUpdateQueue(callback, this.remoteUtil.download);
    }

    /**
     * @protected
     */
    processRemoveFileQueue = (callback) => {
        this.doProcessRemoveFileQueue(callback, this.localUtil.remove);
    }

    /**
     * @protected
     */
    processRemoveDirQueue = (callback) => {
        this.doProcessRemoveDirQueue(callback, this.localUtil.rmdir);
    }


    /**
     * creates list of directories to be created and removed by comparing remote and local directories
     * @protected
     * @param {string[]} remoteDirs
     * @param {string[]} localDirs
     */
    consolidateDirectories(remoteDirs, localDirs) {

        super.consolidateDirectories(remoteDirs, localDirs);

        // process the rest
        let rmdirQueue = localDirs.filter((dir) => dir !== "");
        this.mkdirQueue = remoteDirs.filter((dir) => dir !== "");

        this.rmdirQueue = this.filtersSubDirsFromArray(rmdirQueue);
    }

    /**
     * creates list of files to be added and removed by comparing remote and local files
     * @protected
     * @param {*[]} remoteFiles
     * @param {*[]} localFiles
     */
    consolidateFiles(remoteFiles, localFiles) {

        //if directory will be removed we can skip files located in those directories.
        localFiles = this.filtersFilesInGivenDirs(localFiles, this.rmdirQueue);

        const processedLocalFileIndexes = [];
        // compare files for modifications
        remoteFiles.forEach((rFile) => {
            let lIDX = localFiles.findIndex((f) => (f.id === rFile.id));
            // if a match is found
            if (lIDX !== -1) {
                const lFile = localFiles[lIDX];
                if (Rem2LocSync.isDifferent(lFile, rFile) ||
                    Rem2LocSync.isModified(lFile, rFile)) {
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
}

module.exports = Rem2LocSync;
