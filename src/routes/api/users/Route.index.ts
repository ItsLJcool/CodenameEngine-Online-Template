import { getUsers, getUserById } from "./Handler.index.ts";

export default {
    "/": getUsers,
    "/:id": getUserById,
}