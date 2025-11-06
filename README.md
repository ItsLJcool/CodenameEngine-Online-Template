# CodenameEngine Online Template
This is a template for using WebSocket's in CodenameEngine, This template includes an API and WebSocket automatically created for you.

## THIS IS CURRENTLY IN DEVELOPMENT
I would NOT use this for any production environments, yet!!<br>
If you would like to help contribute to this project, by all means go ahead and make Pull Requests!

## Getting Started
You'll need to instal `bun` before doing anything.
Here is how you can [install bun](https://bun.com/docs/installation#windows)

To install dependencies:
```bash
bun install
```
You can use `.env` to set your Port and other environment variables.
```ini
PORT=5000
DATABASE_URL="file:./prisma/dev.db"
```
PORT by default is set to `3000`.

For initalizing Prisma, you need to initalize migration and generate your prisma client.
Go ahead and run these commands:
```bash
bunx --bun prisma migrate dev --name init
bunx --bun prisma generate
```
If you see a folder inside `prisma` named `prisma` (`./prisma/prisma`) do not worry, it's a bug with Prisma and Bun. It is automatically handled with `db.ts`.

To update the db and migrate your models just run the migration command and re-generate your prisma client.
```bash
bunx --bun prisma migrate dev --name <name-of-migration>
bunx --bun prisma generate
```

To start the Server:
```bash
bun start
bun start:dev # for development
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
