import { Glob, type BunRequest, type HTMLBundle } from 'bun';
import path from 'path';
import { EventEmitter } from "events";


const glob = new Glob('**/*.ts');

// routes
let routes: Record<string, Response | HTMLBundle | { [method: string]: (req: BunRequest) => Response | Promise<Response> }> = {};
for await (const file of glob.scan("./src/routes/")) {
    if (!path.basename(file, path.extname(file)).startsWith("Route.")) continue;
    const local_path = file.replace(/\\/g, "/");
    const route_module = await import(`../routes/${local_path}`);
    if (route_module.default === undefined) {
        console.warn(`⚠️  Route ${local_path} does not export a default export.`);
        continue;
    }

    let api_path = path.dirname(local_path);
    if (api_path === ".") api_path = "/";
    else api_path = `/${api_path}`;
    for (const obj of Object.keys(route_module.default)) {
        const path = (obj.length === 1) ? "" : `${obj}`;
        let route_path = `${api_path}${path}`;
        routes[route_path] = route_module.default[obj];
        // routes[route_path+"/"] = route_module.default[obj]; // weird issue??
    }
}
if (Object.keys(routes).length === 0) {
    console.warn("⚠️  No routes found. Using Backup Route.");
    routes["/"] = new Response("Uh oh! No routes found.");
}


export enum WSEvent {
    ClientConnected = "connection",
    ClientMessage = "message",
    ClientClosed = "close",
    Ping = "ping",
}

export class HTTPHeader {
    headers: Record<string, string> = {};
    content: string = "";
    constructor() { }
    toString() {
        let str = "";
        for (const key in this.headers) str += `${key}: ${this.headers[key]}\r\n`;
        str += `\r\n`;
        if (this.content.length > 0) str += `${this.content}`;
        return str;
    }
}

export class WebSocketServer {
    static ALLOW_CONNECTIONS:Boolean = false;
    static ServerEvent: EventEmitter = new EventEmitter();
    static sendOpen(ws: Bun.ServerWebSocket) {
        WebSocketServer.ServerEvent.emit(WSEvent.ClientConnected, ws);
    }

    static sendMessage(ws: Bun.ServerWebSocket, message: (string | Buffer<ArrayBuffer> | HTTPHeader)) {
        if (Buffer.isBuffer(message)) message = WebSocketServer.validateAndParseMessage(message);

        WebSocketServer.ServerEvent.emit(WSEvent.ClientMessage, ws, message);
    }

    static sendClose(ws: Bun.ServerWebSocket) {
        WebSocketServer.ServerEvent.emit(WSEvent.ClientClosed, ws);
    }

    static validateAndParseMessage(message: Buffer<ArrayBuffer>): (string | Buffer<ArrayBuffer> | HTTPHeader) {
        const stringMessage = message.toString();

        const headerBlock:HTTPHeader | Boolean = WebSocketServer.parseHttpHeaderBlock(stringMessage);
        if (headerBlock instanceof HTTPHeader) return headerBlock;

        return message;
    }

    // TODO: reformat literally everything to make sense cuz idk wtf im doing LMAO
    // If it returns false, it means the header was invalid
    static parseHttpHeaderBlock(input: string): Boolean | HTTPHeader {
        const lines = input.replace(/\r\n/g, "\n").split("\n");
        if (lines.length <= 0) return false;
        const httpHeader = new HTTPHeader();

        let content = "";
        let inContent = false;
        let startIndex = 0;

        const requestLineRegex = /^(?:[A-Z]+)\s+\/\S*\s+HTTP\/\d\.\d$/i;
        if (requestLineRegex.test(lines[0]!.trim())) startIndex = 1; // skip request line

        for (const line of lines.slice(startIndex)) {
            if (inContent) { content += (content ? "\n" : "") + line; continue; }
            if (line.trim() === "") { inContent = true; continue; }

            const match = line.match(/^([!#$%&'*+\-.^_`|~0-9A-Za-z]+):\s*(.+)$/);
            if (match) {
                const left = match[1];
                const right = match[2];
                if (!left || !right) continue;
                httpHeader.headers[left] = right;
            } else return httpHeader;
        }

        httpHeader.content = (content ?? "");
        return httpHeader;
    }

}

const server = Bun.serve({
    port: (process.env.PORT || 3000),
    routes: routes,
    async fetch(request, server) {
        if (!WebSocketServer.ALLOW_CONNECTIONS) return new Response("Server is currently offline", { status: 503 });
        console.log(`request: ${request.url}`);
        const server_upgraded = server.upgrade(request, {
            // headers: {
            //     'Set-Cookie': `SessionId=140`, 
            // }, 
        });
        if (server_upgraded) return;
        return new Response("Upgrade failed", { status: 500 });
    },
    websocket: {
        sendPings: true,
        open: WebSocketServer.sendOpen,
        message: WebSocketServer.sendMessage,
        close: WebSocketServer.sendClose,
    },
});

WebSocketServer.ServerEvent.on(WSEvent.ClientConnected, () => {
    console.log("Client connected");
});

export default server;

console.log(`🌏 Listening on ${server.url}`);
