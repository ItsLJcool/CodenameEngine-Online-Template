import { PrismaClient } from "./generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import fs from "fs/promises";
import path from "path";

const prisma_db_path = (process.env.DATABASE_URL?.replace("file:./", "") || "");
if (await fs.exists(`./prisma/${prisma_db_path}`)) {
    await fs.rename(`./prisma/${prisma_db_path}`, prisma_db_path);
    await fs.rmdir(`./prisma/${path.dirname(prisma_db_path)}`, { recursive: true });
}

const adapter = new PrismaLibSQL({ url: process.env.DATABASE_URL || "" });
export default new PrismaClient({ adapter });

// User Password Regex, thanks Frosty!! [ /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,32}$/g ]
/*
(?=.*[A-Z]) caps
(?=.*\d) numbers
(?=.*[^A-Za-z0-9]) special chars
.{6,32} 6-32 characters
*/
export class User {

    prisma_id: string = "";
    
    password: string = "";
    username: string = "";
    email: string = "";

    discord_id: string = "";
    discord_name: string = "";

    friends: string[] = [];

    constructor(username:string, email?:string, discord_id?:string, discord_name?:string) {
    }

    static async get() {

    }
}