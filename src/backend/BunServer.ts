import { Glob, type BunRequest, type HTMLBundle } from 'bun';
import path from 'path';

const glob = new Glob('**/*.ts');

// routes
let routes: Record<string, Response | HTMLBundle | {[method: string]: (req: BunRequest) => Response|Promise<Response>}> = {};
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

const server = Bun.serve({
    port: (process.env.PORT || 3000),
    routes: routes,
    async fetch(request, server) {
        console.log(`request: ${request.url}`);
        const server_upgraded = server.upgrade(request, {
            // headers: {
            //     'Set-Cookie': `SessionId=140`, 
            // }, 
        });
        if (server_upgraded) return;
        return new Response("Upgrade failed", {status: 500});
    },
    websocket: {
        sendPings: true,
        open: (ws) => {
            console.log("Client connected");
        },
        message: (ws, message) => {
            console.log("Client sent message", message);
            if (Buffer.isBuffer(message)) {}
            else {}
        },
        close: (ws) => {
            console.log("Client disconnected");
        },
    },
});
export default server;

console.log(`🌏 Listening on ${server.url}`);
