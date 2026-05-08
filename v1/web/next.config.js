/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 and sqlite-vec are native modules; Next must not bundle them.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
};

module.exports = nextConfig;
