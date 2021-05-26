const http = require("http");

http.createServer(function (req, res) {
}).listen(3000, "127.0.0.1");

const Sync = require("./src/sync");

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
    "verbose": false
};

const synchronizer = new Sync(config, console);

synchronizer.run((err, results) => {
    console.log("run response", results);
})
