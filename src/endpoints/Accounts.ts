import { WebSocketServer, WSEvent, type BunWebSocketServer, type WebSocketMessage, HTTPHeader, WebSocketResponse } from '../backend/WebSocketData';
import server from '../backend/BunServer';

import { User } from '../../prisma/db';

const LOGIN_VERISON: string = "1.0";

export default {
	onMessage: async (ws: BunWebSocketServer, message: WebSocketMessage): Promise<boolean> => {
		if (!(message instanceof HTTPHeader)) return false;
		const request_header = message.request.split(" ");
		const method = request_header.shift();
		const endpoint = request_header.shift();

		if (method === "GET") return await GET(request_header, endpoint, ws, message);
		if (method === "POST") return await POST(request_header, endpoint, ws, message);
		
		return false;
	}
}

function check_version(request_header:string[], ws:BunWebSocketServer): boolean {
	const info = request_header.shift()?.split("/").pop();
	if (info !== LOGIN_VERISON) {
		ws.send(new WebSocketResponse(400, `Invalid Version.\nUse ${LOGIN_VERISON}`).set("Content-Type", "application/text").toBuffer());
		return false;
	}
	return true;
}

async function GET(request_header:string[], endpoint:string | undefined, ws:BunWebSocketServer, message:HTTPHeader): Promise<boolean> {
	if (!check_version(request_header, ws)) return true;

	switch (endpoint) {
		case "/user":
			const user_response = (await get_user_info(message, ws)).set("Endpoint", "/user").set("Content-Type", "application/text");
			ws.send(user_response.toBuffer());
			break;
		default: return false;
	}
	return true;
}

async function POST(request_header:string[], endpoint:string | undefined, ws:BunWebSocketServer, message:HTTPHeader): Promise<boolean> {
	switch (endpoint) {
		case "/login":
			if (ws.data.is_validated) {
				ws.send(new WebSocketResponse(400, "Already validated.").toBuffer());
				break;
			}
			const login_response = (await login(message, ws)).set("Endpoint", "/login").set("Content-Type", "application/text");
			ws.send(login_response.toBuffer());
			break;
		case "/register":
			const register_response = (await register(message, ws)).set("Endpoint", "/register").set("Content-Type", "application/text");
			ws.send(register_response.toBuffer());
			break;
		default: return false;
	}
	return true;
}

async function login(message: HTTPHeader, ws:BunWebSocketServer): Promise<WebSocketResponse> {
	const email = message.headers.get("email");
	const password = message.headers.get("password");
	if (email == undefined || password == undefined) return new WebSocketResponse(400, "Missing Required Fields.\nUse email and password.");

	const user = await User.get(email);
	if (!user || !await Bun.password.verify(password, user.password)) return new WebSocketResponse(401, "Invalid Credentials.");
	ws.data.is_validated = true;
	ws.data.metadata.user = {
		username: user.username,
		email: user.email,
		discord_id: user.discord_id,
		discord_name: user.discord_name,
	};
	return new WebSocketResponse(200, "Login Successful!").set("UUID", ws.data.uuid);
}

async function get_user_info(message: HTTPHeader, ws:BunWebSocketServer): Promise<WebSocketResponse> {
	const email = message.headers.get("email");
	if (email == undefined) return new WebSocketResponse(400, "Missing Required Fields.\nUse email.");

	const user = await User.get(email);
	if (!user) return new WebSocketResponse(404, "User Not Found.");
	const response = new WebSocketResponse(200, "User Found.").set("Username", user.username).set("Email", user.email);
	if (user.discord_id) response.set("Discord ID", user.discord_id);
	if (user.discord_name) response.set("Discord Name", user.discord_name);
	if (user.friends) response.set("Friends", user.friends.join(","));
	return response;
}

async function register(message: HTTPHeader, ws:BunWebSocketServer): Promise<WebSocketResponse> {
	const email = message.headers.get("email");
	const username = message.headers.get("username");
	const password = message.headers.get("password");

	if (email == undefined || username == undefined || password == undefined) return new WebSocketResponse(400, "Missing Required Fields.\nUse email, username, and password.");
	
	if (!User.EMAIL_REGEX.test(email)) return new WebSocketResponse(400, "Invalid Email.");
	if (!User.PASSWORD_REGEX.test(password)) return new WebSocketResponse(400, "Invalid Password.\nIt must be 6-32 characters long, contain a number, capital letter, and a symbol.");

	if (await User.exists(email)) return new WebSocketResponse(409, "Account Already Exists with this Email.");

	const user = new User(username, (await Bun.password.hash(password)), email);
	if (!(await user.save())) return new WebSocketResponse(400, "Failed create account.");
	return new WebSocketResponse(201, "Account Created Successfully!");
}