const BaseSync = require("./base-sync");

/**
 * synchronizes local files to remote files.
 */
class Loc2RemSync extends BaseSync {

    /**
     * compare a local vs remote file time for modification
     *
     * @param {{time: Date}} localFile
     * @param {{time: Date}} remoteFile
     * @returns {boolean} return TRUE if local file's modified date is later than remote file's
     */
    static isModified = (localFile, remoteFile) => {
        return localFile.time.getTime() > remoteFile.time.getTime();
    }

    getUpdateStatus() {
        const status = super.getUpdateStatus();
        status.totalTransferredSize = this.remoteUtil.totalUploadedSize;

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
            // remove files
            this.processRemoveFileQueue,
            // remove dirs
            this.processRemoveDirQueue,
        ];
    }

    /**
     * @protected
     */
    processMkdirQueue = (callback) => {
        this.doProcessMkdirQueue(callback, this.remoteUtil.mkdir);
    }

    /**
     * @protected
     */
    processAddFileQueue = (callback) => {
        this.doProcessAddFileQueue(callback, this.remoteUtil.upload);
    }

    /**
     * @protected
     */
    processUpdateQueue = (callback) => {
        this.doProcessUpdateQueue(callback, this.remoteUtil.upload);
    }

    /**
     * @protected
     */
    processRemoveFileQueue = (callback) => {
        this.doProcessRemoveFileQueue(callback, this.remoteUtil.remove);
    }

    /**
     * @protected
     */
    processRemoveDirQueue = (callback) => {
        this.doProcessRemoveDirQueue(callback, this.remoteUtil.rmdir);
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
        this.mkdirQueue = localDirs.filter((dir) => dir !== "");
        this.rmdirQueue = remoteDirs.filter((dir) => dir !== "");
        //reversing puts sub directories to the beginning of the array to delete sub directories first and then parent dir
        this.rmdirQueue.reverse();
    }

    /**
     * creates list of files to be added and removed by comparing remote and local files
     * @protected
     * @param {*[]} remoteFiles
     * @param {*[]} localFiles
     */
    consolidateFiles(remoteFiles, localFiles) {

        const processedLocalFileIndexes = [];
        // compare files for modifications
        remoteFiles.forEach((rFile) => {
            let lIDX = localFiles.findIndex((f) => (f.id === rFile.id));
            // if a match is found
            if (lIDX !== -1) {
                const lFile = localFiles[lIDX];
                if (Loc2RemSync.isDifferent(lFile, rFile) ||
                    Loc2RemSync.isModified(lFile, rFile)) {
                    this.updateFileQueue.push(rFile);
                }
                // mark updates as processed

                processedLocalFileIndexes.push(lIDX);
            } else {
                this.removeFileQueue.push(rFile);
            }
        });

        this.addFileQueue = localFiles.filter((f, index) => !processedLocalFileIndexes.includes(index));
    }
}

module.exports = Loc2RemSync;
