
import { Glob } from 'bun';
import path from 'path';

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

	toString(includeContent?: Boolean): String {
		let str = "";
		for (const [key, value] of this.headers) str += `${key}: ${value}\r\n`;
		if (!includeContent) return str;

		if (this.body instanceof Buffer) str += this.body.toString();
		else str += this.body;
		return str;
	}
}

type WebSocketEndpoint = {
	check: (ws:BunWebSocketServer) => Boolean;
	onMessage: (ws: BunWebSocketServer, message: WebSocketMessage) => boolean | Promise<boolean>;
	onClientConnected: (ws: BunWebSocketServer) => void;
	onClientClosed: (ws: BunWebSocketServer) => void;
}

// GOD this is shit 🙏🙏 | please someone help me refactor ts
export class WebSocketServer {
	static ALLOW_CONNECTIONS: Boolean = true;

	static CONNECTIONS: BunWebSocketServer[] = [];

	static endpoints: Array<WebSocketEndpoint> = [];
	static async registerEndpoints(glob:Glob) {
		console.log("Registering Endpoints...");
		for await (const file of glob.scan(path.join(__dirname, "../endpoints/"))) {
			const endpoint = (await import(`../endpoints/${file.replace(/\\/g, "/")}`)).default as WebSocketEndpoint;
			if (endpoint.check == undefined) endpoint.check = () => true;
			if (!endpoint) continue;
			WebSocketServer.endpoints.push(endpoint);
		}
		console.log(`Registered ${WebSocketServer.endpoints.length} Endpoints.`);
	}

	static sendOpen(ws: BunWebSocketServer) {
		for (const endpoint of WebSocketServer.endpoints) {
			if (endpoint.onClientConnected == undefined || !endpoint.check(ws)) continue;
			endpoint.onClientConnected(ws)
		}
		WebSocketServer.CONNECTIONS.push(ws);
	}

	static async sendMessage(ws: BunWebSocketServer, message: WebSocketMessage) {
		if (Buffer.isBuffer(message)) message = WebSocketServer.validateAndParseMessage(message);

		for (const endpoint of WebSocketServer.endpoints) {
			if (endpoint.onMessage == undefined || !endpoint.check(ws)) continue;
			if (await endpoint.onMessage(ws, message)) break;
		}
	}

	static sendClose(ws: BunWebSocketServer) {
		for (const endpoint of WebSocketServer.endpoints) {
			if (endpoint.onClientClosed == undefined || !endpoint.check(ws)) continue;
			endpoint.onClientClosed(ws);
		}

		WebSocketServer.CONNECTIONS = WebSocketServer.CONNECTIONS.filter(connection => connection !== ws);
	}

	static validateAndParseMessage(message: Buffer<ArrayBuffer>): WebSocketMessage {
		const stringMessage = message.toString();

		let headerBlock: Boolean | HTTPHeader = WebSocketServer.parseHttpHeaderBlock(stringMessage);
		if (headerBlock instanceof HTTPHeader) return headerBlock;

		headerBlock = WebSocketServer.parseCustomHeaderBlock(stringMessage);
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
			} else break;
		}
		if (httpHeader.request.length <= 0 && httpHeader.headers.size <= 0 && httpHeader.content.length <= 0) return false;
		httpHeader.content = (content ?? "");
		return httpHeader;
	}

	// TODO: piss myself 😭😭
	static parseCustomHeaderBlock(input: string): Boolean | HTTPHeader {
		const lines = input.replace(/\r\n/g, "\n").split("\n");
		if (lines.length <= 0) return false;
		const httpHeader = new HTTPHeader();

		let content = "";
		let inContent = false;

		const requestLineRegex = /^(?:[A-Z]+)\s+\/\S*\s+Version\/\d\.\d$/i;
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
			} else break;
		}
		if (httpHeader.request.length <= 0 && httpHeader.headers.size <= 0 && httpHeader.content.length <= 0) return false;
		httpHeader.content = (content ?? "");
		return httpHeader;
	}
}

export type ServerData = {
	uuid: string;
	is_validated: Boolean;
	metadata: Record<string, any>;
}

export type BunWebSocketServer = Bun.ServerWebSocket<ServerData>;