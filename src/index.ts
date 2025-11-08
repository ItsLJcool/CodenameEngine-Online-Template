import dotenv from "dotenv"; dotenv.config();
import prisma, { User } from "../prisma/db.ts"; prisma;
import server from "./backend/BunServer.ts"; server;

import { Glob } from 'bun';

const glob = new Glob('**/*.ts');
for await (const file of glob.scan("./src/endpoints/")) { await import(`./endpoints/${file.replace(/\\/g, "/")}`); }