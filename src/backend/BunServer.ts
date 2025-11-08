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
// if (Object.keys(routes).length === 0) {
//     console.warn("⚠️  No routes found. Using Backup Route.");
//     routes["/error"] = new Response("Uh oh! No routes found.");
// }

export enum WSEvent {
	ClientConnected = "connection",
	ClientMessage = "message",
	ClientClosed = "close",
	Ping = "ping",
}

// temporary, need to replace it with something that isn't ducktape 🙏🙏
export class HTTPHeader {
	request: string = "";
	headers: Map<string, string> = new Map<string, string>();
	content: string = "";
	constructor(request?: string | undefined, content?: string | undefined) {
		if (request) this.request = request;
		if (content) this.content = content;
	}

	set(key: string, value: string): HTTPHeader { this.headers.set(key, value); return this; }
	get(key: string): (string | undefined) { return this.headers.get(key); }
	has(key: string): boolean { return this.headers.has(key); }
	delete(key: string): boolean { return this.headers.delete(key); }
	keys(): MapIterator<string> { return this.headers.keys(); }

	toString() {
		let str = "";
		for (const key in this.headers) str += `${key}: ${this.headers.get(key)}\r\n`;
		str += `\r\n`;
		if (this.content.length > 0) str += `${this.content}`;
		return str;
	}
	toBuffer() { return Buffer.from(this.toString()); }
}

export type WebSocketMessage = string | Buffer<ArrayBuffer> | HTTPHeader;
export class WebSocketResponse {
	status: number = 200;
	headers: Map<string, string> = new Map<string, string>();
	body: string | Buffer<ArrayBuffer> = "";
	constructor(status?: number, body?: string | Buffer<ArrayBuffer>) {
		if (status) this.status = status;
		if (body) this.body = body;
	}
	set(key: string, value: string): WebSocketResponse { this.headers.set(key, value); return this; }
	get(key: string): (string | undefined) { return this.headers.get(key); }
	has(key: string): boolean { return this.headers.has(key); }
	delete(key: string): boolean { return this.headers.delete(key); }
	keys(): MapIterator<string> { return this.headers.keys(); }

	toBuffer(): Buffer {
        const headerString = this.toString(false);
        const headerBytes = Buffer.from(headerString, "utf8");

        let bodyBytes: Buffer;
        if (this.body instanceof Buffer) bodyBytes = this.body;
        else if (typeof this.body === "string") bodyBytes = Buffer.from(this.body, "utf8");
        else if (this.body instanceof ArrayBuffer) bodyBytes = Buffer.from(new Uint8Array(this.body));
        else bodyBytes = Buffer.alloc(0);

        // Allocate total buffer:
        // (status bytes) + (header length + header) + (body is string + body length + body)
        const totalLength = (8) + headerBytes.length + (1 + 4) + bodyBytes.length;
        const buffer = Buffer.alloc(totalLength);

        let offset = 0;
        buffer.writeUInt32LE(this.status, offset); offset += 4;

        buffer.writeUInt32LE(headerBytes.length, offset); offset += 4;
        headerBytes.copy(buffer, offset); offset += headerBytes.length;
		
		buffer.writeUInt8((typeof this.body === "string") ? 1 : 0, offset); offset += 1;
        buffer.writeUInt32LE(bodyBytes.length, offset); offset += 4;
        bodyBytes.copy(buffer, offset);
        return buffer;
    }

	toString(includeContent?:Boolean):String {
		let str = "";
		for (const [key, value] of this.headers) str += `${key}: ${value}\r\n`;
		if (!includeContent) return str;

		if (this.body instanceof Buffer) str += this.body.toString();
		else str += this.body;
		return str;
	}
}

export class WebSocketServer {
	static ALLOW_CONNECTIONS: Boolean = true;
	static ServerEvent: EventEmitter = new EventEmitter();

	// quick access to the event emitter
	static on(event: WSEvent, callback: (ws: Bun.ServerWebSocket, message: WebSocketMessage) => void) { WebSocketServer.ServerEvent.on(event, callback); }
	static once(event: WSEvent, callback: (ws: Bun.ServerWebSocket, message: WebSocketMessage) => void) { WebSocketServer.ServerEvent.once(event, callback); }

	static sendOpen(ws: Bun.ServerWebSocket) {
		WebSocketServer.ServerEvent.emit(WSEvent.ClientConnected, ws);
	}

	static sendMessage(ws: Bun.ServerWebSocket, message: WebSocketMessage) {
		if (Buffer.isBuffer(message)) message = WebSocketServer.validateAndParseMessage(message);

		WebSocketServer.ServerEvent.emit(WSEvent.ClientMessage, ws, message);
	}

	static sendClose(ws: Bun.ServerWebSocket) {
		WebSocketServer.ServerEvent.emit(WSEvent.ClientClosed, ws);
	}

	static validateAndParseMessage(message: Buffer<ArrayBuffer>): WebSocketMessage {
		const stringMessage = message.toString();

		const headerBlock: HTTPHeader | Boolean = WebSocketServer.parseHttpHeaderBlock(stringMessage);
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

		const requestLineRegex = /^(?:[A-Z]+)\s+\/\S*\s+HTTP\/\d\.\d$/i;
		if (requestLineRegex.test(lines[0]!.trim())) httpHeader.request = lines.shift()!.trim();

		for (const line of lines) {
			if (inContent) { content += (content ? "\n" : "") + line; continue; }
			if (line.trim() === "") { inContent = true; continue; }

			const match = line.match(/^([!#$%&'*+\-.^_`|~0-9A-Za-z]+):\s*(.+)$/);
			if (match) {
				const left = match[1];
				const right = match[2];
				if (!left || !right) continue;
				httpHeader.headers.set(left.toLowerCase(), right);
			} else return httpHeader;
		}

		httpHeader.content = (content ?? "");
		return httpHeader;
	}

}

const server = Bun.serve({
	port: (process.env.PORT || 3000),
	routes: {},
	async fetch(req: BunRequest, server) {
		if (!WebSocketServer.ALLOW_CONNECTIONS) return new Response("Server is currently offline",
			{ status: 503, headers: { "X-WebSocket-Reject-Reason": "Server is currently offline", } });

		const server_upgraded = server.upgrade(req);

		if (server_upgraded) return;
		return new Response("Upgrade failed",
			{ status: 500, headers: { "X-WebSocket-Reject-Reason": "Upgrade Failed", } });
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
