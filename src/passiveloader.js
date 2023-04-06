import * as THREE from "three";
import { computeFocalLength, computeSSE } from "./utils/loader";

let direction = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 1],
  [1, 0, 0],
  [1, 0, 1],
  [1, 1, 0],
  [1, 1, 1],
];

let cameraFocalLength = computeFocalLength(90);

async function* lazyLoad(offsetMap, url) {
  while (offsetMap.length > 0) {
    let fetchStart = offsetMap.pop();
    let bytesofPointData = offsetMap.pop();
    let fetchEnd = fetchStart + bytesofPointData;
    let response = await fetch(url, {
      headers: {
        "content-type": "multipart/byteranges",
        Range: `bytes=${fetchStart}-${fetchEnd}`,
      },
    });
    let buffer = await response.arrayBuffer();
    let view = new DataView(buffer);
  }
}

function isLeadfNode(root, nodePages) {
  let [level, x, y, z] = root;
  for (let i = 0; i < direction.length; i++) {
    let [dx, dy, dz] = direction[i];
    let newLevel = level + 1;
    let key = `${newLevel}-${2 * x + dx}-${2 * y + dy}-${2 * z + dz}`;
    if (key in nodePages) {
      return false;
    }
  }
  return true;
}

let canvas = document.getElementById("screen-canvas");
canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
let screenWidth = canvas.clientWidth;
let screenHeight = canvas.height;
let fovRADIAN = Math.PI / 2;

function isRendered(center, radius, distance, projViewMatrix, key) {
  let minPoint = [center[0] - radius, center[1] - radius, center[2] - radius];
  let maxPoint = [center[0] + radius, center[1] + radius, center[2] + radius];
  let frustum = new Frustum(projViewMatrix);
  if (!frustum.containsBox([...minPoint, ...maxPoint])) {
    console.log("outof frustum");
    return false;
  }
  let projectedRadius =
    (radius * screenHeight) / (distance * (2 * Math.tan(fovRADIAN / 2.0)));
  return Math.abs(projectedRadius) > 120;
}

function traverseTreeWrapper(
  nodePages,
  root,
  center_x,
  center_y,
  center_z,
  width,
  scale,
  camera,
  projViewMatrix
) {
  let cameraPosition = camera.eyePos();
  console.log(cameraPosition);
  function traverseTree(root, center_x, center_y, center_z, width) {
    let [level, x, y, z] = root;
    let newLevel = level + 1;
    let key = level + "-" + x + "-" + y + "-" + z;
    let distance = Math.sqrt(
      Math.pow(Math.abs(cameraPosition[0] - center_x), 2) +
        Math.pow(Math.abs(cameraPosition[1] - center_y), 2) +
        Math.pow(Math.abs(cameraPosition[2] - center_z), 2)
    );
    if (
      !isRendered(
        [center_x, center_y, center_z],
        Math.max(...width),
        distance,
        projViewMatrix,
        key
      )
    ) {
      return [];
    }
    let x_left = center_x - width[0] / 2;
    let x_right = center_x + width[0] / 2;
    let y_top = center_y + width[1] / 2;
    let y_bottom = center_y - width[1] / 2;
    let z_near = center_z + width[2] / 2;
    let z_far = center_z - width[2] / 2;

    let result = [key, nodePages[key].pointCount];
    direction.forEach((element, index) => {
      let [dx, dy, dz] = element;
      let key1 = `${newLevel}-${2 * x + dx}-${2 * y + dy}-${2 * z + dz}`;
      if (!(key1 in nodePages && nodePages[key].pointCount > 0)) {
        return [];
      }
      center_x = x_left;
      center_y = y_bottom;
      center_z = z_far;
      if (dx == 1) {
        center_x = x_right;
      }
      if (dy == 1) {
        center_y = y_top;
      }
      if (dz == 1) {
        center_z = z_near;
      }
      let result1 = traverseTree(
        [newLevel, 2 * x + dx, 2 * y + dy, 2 * z + dz],
        center_x,
        center_y,
        center_z,
        [width[0] / 2, width[1] / 2, width[2] / 2]
      );
      result.push(...result1);
    });
    return result;
  }
  let finalPoints = traverseTree(root, center_x, center_y, center_z, [
    width[0],
    width[1],
    width[2],
  ]);
  return finalPoints;
}

export { traverseTreeWrapper };
