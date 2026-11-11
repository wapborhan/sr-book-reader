/** @type {import('next').NextConfig} */
const nextConfig = {
  // basePath: "/book-list",
  output: "export",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
