/**
 * TypeDoc plugin for customizing the generated API documentation
 */
export function load(app) {
  // Add description at the beginning of the index page
  app.renderer.markdownHooks.on("index.page.begin", () => {
    return `> Auto-generated from TSDoc using [TypeDoc](https://typedoc.org/)

`;
  });
}
