import { PrismaClient } from "./generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import type { password } from "bun";
import fs from "fs/promises";
import path from "path";

const prisma_db_path = (process.env.DATABASE_URL?.replace("file:./", "") || "");
if (await fs.exists(`./prisma/${prisma_db_path}`)) {
    await fs.rename(`./prisma/${prisma_db_path}`, prisma_db_path);
    await fs.rmdir(`./prisma/${path.dirname(prisma_db_path)}`, { recursive: true });
}

const adapter = new PrismaLibSQL({ url: process.env.DATABASE_URL || "" });
const prisma = new PrismaClient({ adapter });
export default prisma;

// User Password Regex, thanks Frosty!! [ /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,32}$/g ]
/*
(?=.*[A-Z]) caps
(?=.*\d) numbers
(?=.*[^A-Za-z0-9]) special chars
.{6,32} 6-32 characters
*/
export class User {
    password: string = "";
    username: string = "";
    email: string = "";

    discord_id: (string | undefined) = undefined;
    discord_name: (string | undefined) = undefined;

    friends: string[] = [];

    constructor(username:string, password:string, email:string) {
        this.username = username;
        this.password = password;
        this.email = email;
    }

    async save() {
        const data = this.toPrisma();
        if (await User.exists_email(this.email)) await prisma.user.update({ where: { email: this.email }, data });
        else if (await User.exists_username(this.username)) await prisma.user.update({ where: { username: this.username }, data });
        else await prisma.user.create({ data });
        return this;
    }

    toPrisma() {
        return {
            username: this.username,
            password: this.password,
            email: this.email,
            discord_id: this.discord_id,
            discord_name: this.discord_name,
            friends: this.friends,
        };
    }

    static fromPrisma(_user:any) {
        const user = new User(_user.username, _user.password, _user.email);
        user.discord_id = _user.discord_id;
        user.discord_name = _user.discord_name;
        if (_user.friends) user.friends = _user.friends;
        return user;
    }

    static async get_username(username:string, password?:string) {
        if (password) return (await prisma.user.findUnique({ where: { username, password }, }));
        return (await prisma.user.findUnique({ where: { username }, })); 
    }
    static async exists_username(username:string, password?:string) { return ((await this.get_username(username, password)) != null); }

    static async get_email(email:string) { return (await prisma.user.findUnique({ where: { email }, })); }
    static async exists_email(email:string) { return ((await this.get_email(email)) != null); }

    static async findMany() { return (await prisma.user.findMany()); }
    static async findFirst() { return (await prisma.user.findFirst()); }
    // static async deleteAll() { return (await prisma.user.deleteMany()); } // Scary!!!
}