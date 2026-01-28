import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;

let client;

export default async function connectDB() {
  client = new MongoClient(uri);
  await client.connect();
  console.log("🧶 Connected to MongoDB");
}

export function getDB() {
  return client.db("patchwork");
}
