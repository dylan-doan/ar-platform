// No-op stub for the native `canvas` module.
//
// The real `canvas` is only pulled in by MindAR's Node-side offline compiler; the browser
// AR runtime (mindar-image-three.prod.js) never imports it. We stub it so `npm install`
// doesn't try to build the native addon (fails on Node 26). Our compile script
// (scripts/compile-mind-target.mjs) subclasses OfflineCompiler and overrides the one
// method that would use canvas, so these stubs are never actually invoked for pixels.
function createCanvas(width, height) {
  return {
    width,
    height,
    getContext() {
      return {
        drawImage() {},
        getImageData() {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        putImageData() {},
        fillRect() {},
      };
    },
  };
}
function loadImage() {
  return Promise.reject(new Error("canvas stub: loadImage is not supported"));
}
const Image = class {};
module.exports = { createCanvas, loadImage, Image };
module.exports.default = module.exports;
