class Loader {
  constructor(url) {
    this.url = url;
  }
  async loadHeader() {
    // loadheader
    let loaderByteSize = 549;
  }
}

function computeFocalLength(angle) {
  let angleRadian = (angle * Math.PI) / 180;
  return 0.5 * (1 / Math.tan(angleRadian / 2));
}

function computeSSE(width, distance, focalLength) {
  return (width / distance) * focalLength;
}

export {computeFocalLength, computeSSE}