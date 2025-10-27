import dotenv from "dotenv"; dotenv.config();
import server from "./backend/BunServer.ts"; server;

// const socket = new WebSocket("ws://localhost:5000/ws");
// socket.addEventListener("open", () => {
//     socket.send("Hello!"); // now safe to send
// });
// socket.addEventListener("message", (event) => {
//     console.log(event.data);
// });
// console.log(socket);