/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "**/backend/**",
        "**/venv/**",
        "**/data/**",
        "**/notebooks/**",
        "**/tests/**",
      ],
    },
  },
};

module.exports = nextConfig;
