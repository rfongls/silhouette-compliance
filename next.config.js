const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    instrumentationHook: true,
    cpus: 1,
    workerThreads: false,
    // PDFKit resolves bundled AFM fonts through package-internal import maps.
    // Keep it external so production Node resolves those assets from node_modules.
    serverComponentsExternalPackages: ["pdfkit"]
  },
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  }
};

module.exports = nextConfig;
