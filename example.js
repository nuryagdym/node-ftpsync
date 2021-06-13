const http = require("http");

http.createServer(function (req, res) {
}).listen(3000, "127.0.0.1");

const {Rem2LocSync, Loc2RemSync} = require("./src/index");

let config = {
    "host": "example.com",
    "user": "anonymous",
    "pass": "guest",
    "port": 21,
    "local": "D:\\ftp-sync-testing",
    "remote": "/files",
    "ignore": [
        "/folder",
        "*.mp3",
        "/backgrounds"
    ],
    "connections": 1,
    //retry times on ETIMEDOUT error
    "retryLimit": 3,
    "verbose": true
};
/**
 * console as a logger or any other logger that supports `info`, `debug`, `error` methods
 * @type {BaseSync}
 */
//const synchronizer = new Rem2LocSync(config, console);
const synchronizer = new Loc2RemSync(config, console);

const interval = setInterval(() => {
    console.log("synchronizer status", synchronizer.getUpdateStatus());
}, 5000);
synchronizer.run((err, results) => {
    clearInterval(interval);
    console.log("run response", synchronizer.getUpdateStatus());
})
