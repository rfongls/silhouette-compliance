const http = require("http");
const next = require("next");

const dev = false;
const hostname = "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(`Silhouette Compliance ready on http://${hostname}:${port}`);
  });
});
