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
// email regex ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
export class User {
    static EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    static PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,32}$/g;
    password: string = ""; // this will be hashed btw
    username: string = "";
    email: string = "";

    discord_id: (string | undefined) = undefined;
    discord_name: (string | undefined) = undefined;

    friends: string[] = [];

    constructor(username:string, hash_password:string, email:string) {
        this.username = username;
        this.password = hash_password;
        this.email = email;
    }

    // Returns true if the user was saved, false if it failed to save.
    async save(): Promise<Boolean> {
        if (!User.EMAIL_REGEX.test(this.email)) return false;

        const data = this.toPrisma();
        if (await User.exists(this.email)) await prisma.user.update({ where: { email: this.email }, data });
        else await prisma.user.create({ data });

        return true;
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

    static async get(email:string) { return User.fromPrisma(await prisma.user.findUnique({ where: { email } })); }
    static async exists(email:string) { return ((await this.get(email)) != null); }

    static async findMany() { return (await prisma.user.findMany()); }
    static async findFirst() { return (await prisma.user.findFirst()); }
    // static async deleteAll() { return (await prisma.user.deleteMany()); } // Scary!!!
}