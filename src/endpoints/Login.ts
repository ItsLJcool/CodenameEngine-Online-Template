import { WebSocketServer, WSEvent, type WebSocketMessage, HTTPHeader, WebSocketResponse} from '../backend/BunServer';

import { User } from '../../prisma/db';

// Probably a better idea is to format it like DiscordJS, where you can export a structure, and have the functions there.
WebSocketServer.on(WSEvent.ClientMessage, async (ws:Bun.ServerWebSocket, message:WebSocketMessage) => {
    if (!(message instanceof HTTPHeader)) return;
    const request_header = message.request.split(" ");
    const method = request_header.shift();
    const endpoint = request_header.shift();

    if (method !== "POST" || endpoint !== "/login") return;
    
    const login_response = await login(message);
    if (!login_response) return ws.send(new WebSocketResponse(401, "Invalid Credentials").set("Content-Type", "application/text").toBuffer());
    ws.send(new WebSocketResponse(200, "Login Successful").set("Endpoint", "/login").set("Content-Type", "application/text").toBuffer());
});

async function login(message: HTTPHeader):Promise<Boolean> {
    const username = message.headers.get("username");
    const password = message.headers.get("password");
    if (username == undefined || password == undefined) return false;
    
    const user = await User.get_username(username, password);
    if (!user) return false;
    return true;
}
