import("./js/app.js")
  .then(({ initApp }) => {
    initApp();
  })
  .catch((err) => {
    console.error("Failed to initialize app:", err);
  });
