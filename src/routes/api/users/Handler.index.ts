import type { BunRequest } from "bun";

export function getUsers() {
    return new Response("[]");
}

export function getUserById(req:BunRequest<"/api/users/:id">) {
    return new Response(`User ${req.params.id}`);
}