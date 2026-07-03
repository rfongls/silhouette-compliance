/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    instrumentationHook: true,
    cpus: 1,
    workerThreads: false
  }
};

module.exports = nextConfig;
