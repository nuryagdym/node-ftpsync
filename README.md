# node-ftpsync

A Remote to Local and Local to Remote FTP synchronization library for NodeJS based on 
[basic-ftp](https://www.npmjs.com/package/basic-ftp).

**Notice: This application will delete files and directories on the remote server/local device to match the local/remote machine.
Use this library in production at your own risk.**

### Requirements
- NodeJS `>=12.10.0`

### Installation

`npm i node-ftpsync`

#### Usage
```js
const {Rem2LocSync, Loc2RemSync} = require("node-ftpsync");
const config = require("./config.json");
/**
 * console as a logger or any other logger that supports `info`, `debug`, `error` methods
 * @type {BaseSync}
 */
// for Remote to Local synchronization
//const synchronizer = new Rem2LocSync(config, console);

// for Local to Remote synchronization
const synchronizer = new Loc2RemSync(config, console);

const interval = setInterval(() => {
    console.log("synchronizer status", synchronizer.getUpdateStatus());
}, 5000);
synchronizer.run((err, results) => {
    clearInterval(interval);
    console.log("run response", synchronizer.getUpdateStatus());
})
```
You can find usage more examples in [example.js](example.js) file.

#### Configuration

```json
{
  "local": "~/www/",
  "remote": "/",
  "host": "example.com",
  "port": 21,
  "user": "username",
  "pass": "password",
  "connections": 1,
  "retryLimit": 3,
  "ignore": [
    ".htaccess",
    "*.mp3",
    "/.idea"
  ]
}
```

  - `host` - hostname/address of the remote FTP server (required).
  - `port` - port of the remote ftp server (default `21`).
  - `user` - FTP username (default "anonymous").
  - `pass` - FTP password (default "guest").
  - `local` - the root directory of the local host (default `'./'`).
  - `remote` - the root path of the remote server (default `'./'`).
  - `connections` - the max number of concurrent FTP connections (default `1`, currently supports only `1`).
  - `ignore` - the list of file patterns to ignore. Ignore patterns can be defined as a filename, file path, or glob match.*
  - `retryLimit` - retry times on FTP `ETIMEDOUT` error.

#### ftpsync.local{}

The file and directory listings for the local host.

- `ftpsync.local.dirs` - contains a string array. Each path represents a local directory.
- `ftpsync.local.files` - contains a list of objects. Each object in the list represents a file and contains a `id` (path), `size`, and `time` attribute with the requisite values for that file.

Populated by running `ftpsync.collect()` or `ftpsync.localUtil.walk()`.

#### ftpsync.remote{}

The file and directory listings for the remote host.

- `ftpsync.remote.dirs` - contains a string array. Each path represents a remote directory.
- `ftpsync.remote.files` - contains a list of objects. Each object in the list represents a file and contains a `id` (path), `size`, and `time` attribute with the requisite values for that file.

Populated by running `ftpsync.collect()` or `ftpsync.remoteUtil.walk()`.

#### ftpsync.mkdirQueue[]

The list of directories queued for creation.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.rmdirQueue[]

The list of directories queued for deletion.

**Note:** On Remote to Local synchronization if parent and its sub directory is going to be deleted, then this array will contain only parent directory.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.addFileQueue[]

The list of files queued for addition.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.updateFileQueue[]

The list of files queued for an update.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.removeFileQueue[]

The list of files queued for removal.

**Note:** On Remote to Local synchronization if a directory is going to be removed then files in this directory will not be listed in this list.

Populated by running `ftpsync.consolidate()`.

### Methods

#### ftpsync.run(callback)

Completes the full synchronization from start to finish. Runs `setUp()`, `collect()`, `consolidate()`, and `commit()`.

#### ftpsync.setUp(callback)

The initialization step of the synchronization process.
It tries to open an FTP connection.

#### ftpsync.collect(callback)

Walks file trees for both the local host and remote server and prepares them for further processing. The resulting file lists are stored in `ftpsync.local[]`, and `ftpsync.remote[]` upon successful completion.

#### ftpsync.consolidate(callback)

Runs comparisons on the local and remote file listings.
- The resulting queues can be found in `mkdirQueue[]`, `rmdirQueue[]`, `addFileQueue[]`, `updateFileQueue[]`, and `removeFileQueue[]` upon successful completion.
- Files that exist in both on remote and local but are different (determined by file size and time stamp) are queued for update.
- ignored paths will not be touched.
##### Remote To Local Sync 
- Files/directories that exist on the local directory but not on the remote directory are queued for removal.
- Files/directories that exist on the remote directory but not on the local directory are queued for addition.
##### Local To Remote Sync
- Files/directories that exist on the remote directory but not on the local directory are queued up for removal.
- Files/directories that exist on the local directory but not on the remote directory are queued for addition.

#### ftpsync.commit(callback)

Processes 
1. `mkdirQueue[]`
2. `addFileQueue[]`
3. `updateFileQueue[]`
4. `removeFileQueue[]`
5. `rmdirQueue[]`

these queues one by one.

#### ftpsync.getUpdateStatus()

Can be used to get the progress status of `ftpsync.run()`.
Returns following object:
```json
{                     
    "numOfChanges": 233,
    "numOfLocalFiles": 121,
    "numOfRemoteFiles": 176,
    "totalTransferSize": 91791972,
    "totalDownloadedSize": 0,
    "totalLocalSize": 38663190,
    "totalRemoteSize": 95514914
}
```
- `numOfChanges` - `== ftpsync.removeFileQueue.length + ftpsync.rmdirQueue.length + ftpsync.addFileQueue.length + ftpsync.updateFileQueue.length;`
- `numOfLocalFiles` - `== ftpsync.local.files.length`.
- `numOfRemoteFiles` - `== ftpsync.remote.files.length`.
- `totalTransferSize` - `== sumFileSizes(ftpsync.addFileQueue) + sumFileSizes(ftpsync.updateFileQueue)`. total bytes that are going to be downloaded/uploaded.
- `totalTransferredSize` - in bytes, updated as files successfully downloaded/uploaded. Should be equal to `totalTransferSize` when commit() finishes successfully.
- `totalLocalSize` - `== sumFileSizes(ftpsync.local.files)` in bytes
- `totalRemoteSize` - `== sumFileSizes(ftpsync.remote.files)` in bytes

Roadmap
-------
### Short Term
 - support for multiple FTP connections 
 - unit tests
 - command line support
