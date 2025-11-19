import { Glob, type BunRequest, type HTMLBundle } from 'bun';
import path from 'path';

import { WSEvent, WebSocketServer, type ServerData } from "./WebSocketData.ts";

const glob_ts = new Glob('**/*.ts');

// routes
let routes: Record<string, Response | HTMLBundle | { [method: string]: (req: BunRequest) => Response | Promise<Response> }> = {};
for await (const file of glob_ts.scan("./src/routes/")) {
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

await WebSocketServer.registerEndpoints(glob_ts);

const server = Bun.serve<ServerData>({
	port: (process.env.PORT || 3000),
	routes: {},
	async fetch(req: BunRequest, server) {
		if (!WebSocketServer.ALLOW_CONNECTIONS) return new Response("Server is currently offline",
			{ status: 503, headers: { "X-WebSocket-Reject-Reason": "Server is currently offline", } });

		const server_upgraded = server.upgrade(req, {
			data: ({uuid: crypto.randomUUID(), is_validated: false, metadata: {}})
 		});

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

export default server;

console.log(`🌏 Listening on ${server.url}`);
