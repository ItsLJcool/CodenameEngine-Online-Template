import dotenv from "dotenv"; dotenv.config();
import prisma, { User } from "../prisma/db.ts"; prisma;
import server from "./backend/BunServer.ts"; server;