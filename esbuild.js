const esbuild = require("esbuild");
const fs = require("fs");
const { copy } = require("esbuild-plugin-copy");

const buildDir = "build";

const config = {
  entryPoints: ["src/server.ts"],
  bundle: true,
  outfile: `${buildDir}/server.js`,
  platform: "node",
  target: "es2020",
  format: "cjs",
  sourcemap: true,
  external: ["fs", "path", "zeromq", "tiktoken"],
  plugins: [
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["src/tokenization/*.py"],
        to: [`${buildDir}/tokenization`],
      },
    }),
  ],
};

function createBundler() {
  return {
    build: async () => esbuild.build(config),
    watch: async () => {
      const watchConfig = { ...config, logLevel: "info" };
      const ctx = await esbuild.context(watchConfig);
      ctx.watch();
    },
  };
}

(async () => {
  fs.rmSync(buildDir, { recursive: true, force: true });
  const isDev = process.argv.includes("--dev");
  const bundler = createBundler();
  if (isDev) {
    await bundler.watch();
  } else {
    await bundler.build();
  }
})();
