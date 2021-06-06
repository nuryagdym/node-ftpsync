# nodejs-ftpsync

An Remote to Local FTP synchronization library for NodeJS based on 
[basic-ftp](https://www.npmjs.com/package/basic-ftp).

### Requirements
- NodeJS `>=12.10.0`

#### Usage
You can find usage example in [example.js](example.js) file.

#### Run the example script

`node example.js`

example configuration

```js
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
    "/.idea",
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
- `ftpsync.local.files` - contains a list of objects. Each object in the list represents a file and contains a `id`, `size`, and `time` attribute with the requisite values for that file.

Populated by running `ftpsync.collect()` or `ftpsync.localUtil.walk()`.

#### ftpsync.remote{}

The file and directory listings for the remote host.

- `ftpsync.remote.dirs` - contains a string array. Each path represents a remote directory.
- `ftpsync.remote.files` - contains a list of objects. Each object in the list represents a file and contains a `id`, `size`, and `time` attribute with the requisite values for that file.

Populated by running `ftpsync.collect()` or `ftpsync.remoteUtil.walk()`.

#### ftpsync.mkdirQueue[]

The list of directories queued for creation on the local device.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.rmdirQueue[]

The list of directories queued for deletion on the local device.

**Note:** If parent and its sub directory is going to be deleted, then this array will contain only parent directory.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.addFileQueue[]

The list of files queued for addition on the local device.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.updateFileQueue[]

The list of files queued for an update on the local device.

Populated by running `ftpsync.consolidate()`.

#### ftpsync.removeFileQueue[]

The list of files queued for removal from the local device.

**Note:** if a directory is going to be removed then files in this directory will not be listed in this list.

Populated by running `ftpsync.consolidate()`.

### Methods

#### ftpsync.run(callback)

Completes the full synchronization from start to finish. Runs `setUp()`, `collect()`, `consolidate()`, and `commit()`.

#### ftpsync.setUp(callback)

The initialization step of the synchronization process.
It tries to open an FTP connection.

#### ftpsync.collect(callback)

Walks the file trees for both the local host and remote server and prepares them for further processing. The resulting file lists are stored in `ftpsync.local[]`, and `ftpsync.remote[]` upon successful completion.

#### ftpsync.consolidate(callback)

Runs comparisons on the local and remote file listings.

- Files/directories that exist in the local directory but not in the remote server are queued up for removal.
- Files/directories that exist in on the remote directory but not the local are queued for addition.
- Files that exist in both but are different (determined by file size and time stamp) are queued for update.
- The resulting queues can be found in `mkdirQueue[]`, `rmdirQueue[]`, `addFileQueue[]`, `updateFileQueue[]`, and `removeFileQueue[]` upon successful completion.

#### ftpsync.commit(callback)

Processes 
1. `mkdirQueue[]`
2. `addFileQueue[]`
3. `updateFileQueue[]`
4. `removeFileQueue[]`
5. `rmdirQueue[]`

these queues in order.

#### ftpsync.getUpdateStatus()

Can be used to get the progress status of `ftpsync.run()`.
Returns following object:
```js
{                     
    numOfChanges: 233,
    numOfLocalFiles: 121,
    numOfRemoteFiles: 176,
    totalDownloadSize: 91791972,
    totalDownloadedSize: 0,
    totalLocalSize: 38663190,
    totalRemoteSize: 95514914
}
```
- `numOfChanges` - `== ftpsync.removeFileQueue.length + ftpsync.rmdirQueue.length + ftpsync.addFileQueue.length + ftpsync.removeFileQueue.length + ftpsync.updateFileQueue.length`;
- `numOfLocalFiles` - `== ftpsync.local.files.length`.
- `numOfRemoteFiles` - `== ftpsync.remote.files.length`.
- `totalDownloadSize` - `== sumFileSizes(ftpsync.addFileQueue) + sumFileSizes(ftpsync.updateFileQueue)`. total bytes that are going to be downloaded.
- `totalDownloadedSize` - in bytes, updated as files successfully downloaded. Should be equal to totalDownloadSize when commit() finishes successfully.
- `totalLocalSize` - `== sumFileSizes(ftpsync.local.files)` in bytes
- `totalRemoteSize` - `== sumFileSizes(ftpsync.remote.files)` in bytes

Roadmap
-------
### Short Term
 - support for multiple FTP connections 
### Long Term
 - remote to local sync functionality.
