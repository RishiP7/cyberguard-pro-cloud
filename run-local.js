(async () => {
  try {
    console.log("[runner] importing app/src/index.js");
    await import('./app/src/index.js');
    console.log("[runner] import finished (server should be listening)");
  } catch (e) {
    console.error("[runner] top-level error:", e && (e.stack || e));
    process.exit(1);
  }
})();
