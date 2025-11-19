// TODO: implement once we have implemented Users being able to connect via WebSocket

import { WebSocketServer, WSEvent, type BunWebSocketServer, type WebSocketMessage, HTTPHeader, WebSocketResponse } from '../backend/WebSocketData';
import server from '../backend/BunServer';

import { User } from '../../prisma/db';

const ROOMS_VERISON: string = "1.0";

export default {
	check(ws:BunWebSocketServer): Boolean { return true; },
	onMessage: async (ws: BunWebSocketServer, message: WebSocketMessage): Promise<boolean> => {
		if (!(message instanceof HTTPHeader)) return false;
        const request_header = message.request.split(" ");
        const method = request_header.shift();
        const endpoint = request_header.shift();
        
        if (endpoint == undefined) {
            ws.send(new WebSocketResponse(400, "Missing Required Fields.\nSend valid Endpoint").toBuffer());
            return true;
        }

        if (method === "GET") return await GET(request_header, endpoint, ws, message);
        if (method === "POST") return await POST(request_header, endpoint, ws, message);
        
        return false;
    },
    onClientConnected(ws: BunWebSocketServer) {
        // ws.subscribe("rooms_notification");
    },
    onClientClosed(ws: BunWebSocketServer) {
        const room = Room.find(ws);
        if (!room) return;
        room.remove_member(ws);
    }
}

function check_version(request_header:string[], ws:BunWebSocketServer): Boolean {
    const info = request_header.shift()?.split("/").pop();
    if (info !== ROOMS_VERISON) return false;
    return true;
}

async function GET(request_header:string[], endpoint:string | undefined, ws:BunWebSocketServer, message:HTTPHeader): Promise<boolean> {
    if (!check_version(request_header, ws)) return true;
    if (!ws.data.is_validated) {
        ws.send(new WebSocketResponse(401, "Not Authorized.").set("Content-Type", "application/text").toBuffer());
        return true;
    }
    
    ws.send(new WebSocketResponse(501, "Not Implemented").toBuffer());
    
    return true;
}

async function POST(request_header:string[], endpoint:string | undefined, ws:BunWebSocketServer, message:HTTPHeader): Promise<boolean> {
    if (!check_version(request_header, ws)) return true;
    if (!ws.data.is_validated) {
        ws.send(new WebSocketResponse(401, "Not Authorized.").set("Content-Type", "application/text").toBuffer());
        return true;
    }

    const name = message.headers.get("name");
    switch (endpoint) {
        case "/rooms/create":
            if (name == undefined) { ws.send(new WebSocketResponse(400, "Missing Required Fields.\nSend valid name").toBuffer()); return true; }
            new Room(name, ws);
            break;
        case "/rooms/join":
            if (name == undefined) { ws.send(new WebSocketResponse(400, "Missing Required Fields.\nSend valid name").toBuffer()); return true; }
            const room = Room.get(name);
            if (!room) { ws.send(new WebSocketResponse(404, "Room Not Found").toBuffer()); return true; }
            break;
        default: return false;
    }

    return true;
}

export class Room {

    static _CACHE: Room[] = [];
    static get(name:string): Room | undefined { return Room._CACHE.find(room => room.name === name); }
    static find(owner:BunWebSocketServer): Room | undefined { return Room._CACHE.find(room => room.owner === owner); }
    static disband(name:string):Boolean {
        const room = Room.get(name);
        if (!room) return false;
        room.disband();
        return true;
    }

    name: string;
    owner: BunWebSocketServer | undefined;
    members: BunWebSocketServer[] = [];
    is_private: Boolean = false;
    invites:string[] = []; // idea for now
    constructor(name:string, owner:BunWebSocketServer | undefined, is_private:Boolean = false) {
        this.name = name;
        this.is_private = is_private;
        if (owner) {
            this.owner = owner;
            this.add_member(owner);
        }
        Room._CACHE.push(this);
    }

    add_member(user:BunWebSocketServer) {
        if (this.members.includes(user)) return;
        this.members.push(user);
        this.send(new WebSocketResponse(200, "User Joined Room").set("User-UUID", user.data.uuid));
        user.subscribe(`room_${this.name}`);
        if (this.invites.includes(user.data.uuid)) this.invites = this.invites.filter(invite => invite !== user.data.uuid);
    }

    remove_member(user:BunWebSocketServer) {
        this.members = this.members.filter(member => member !== user);
        user.unsubscribe(`room_${this.name}`);
        this.send(new WebSocketResponse(200, "User Left Room").set("User-UUID", user.data.uuid));
        if (this.members.length <= 0) this.disband();
    }

    send(message:WebSocketResponse) {
        message.set("Endpoint", `/rooms`).set("Room", this.name).set("Is-Private", `${this.is_private}`);
        server.publish(`room_${this.name}`, message.toBuffer());
    }

    // idea for now
    invite(user:string) {
        this.invites.push(user);
    }

    disband() { Room._CACHE = Room._CACHE.filter(room => room.name !== this.name); }
}

new Room("Global Chat Room", undefined);