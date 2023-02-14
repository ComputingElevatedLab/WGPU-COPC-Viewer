import { Copc, Key } from "copc";
import * as THREE from "three";
const color = new THREE.Color();
const colors = [];
let firstTime = true;
var nodePages, pages, receivedData, copc;
let x_min, y_min, z_min, x_max, y_max, z_max, widthx, widthy, widthz;
let positions = [];
let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";

const readPoints = (id, getters) => {
  let returnPoint = getXyzi(id, getters);
  positions.push(
    returnPoint[0] - x_min - 0.5 * widthx,
    returnPoint[1] - y_min - 0.5 * widthy,
    returnPoint[2] - z_min - 0.5 * widthz
  );
  const vx = returnPoint[3] / 65535;
  color.setRGB(vx, vx, vx);
  colors.push(color.r, color.g, color.b);
  firstTime = false;
};

function getXyzi(index, getters) {
  return getters.map((get) => get(index));
}

async function load() {
  // copc = await Copc.create(filename);
  // let scale = copc.header.scale[0];
  // [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  // width = Math.abs(x_max - x_min);
  // // let center_x = (x_min + x_max) / 2;
  // // let center_y = (y_min + y_max) / 2;
  // // let center_z = (z_min + z_max) / 2;
  // receivedData = await Copc.loadHierarchyPage(
  //   filename,
  //   copc.info.rootHierarchyPage
  // );
  // nodePages = receivedData.nodes;
  // pages = receivedData.pages;
  postMessage(200);
}

async function loadData(nodes, pages, copc, myRoot, pointCount) {
  // console.log(copc, myRoot);
  const view = await Copc.loadPointDataView(filename, copc, myRoot);
  let getters = ["X", "Y", "Z", "Intensity"].map(view.getter);
  for (let j = 0; j < pointCount; j += 1) {
    readPoints(j, getters);
  }
  postMessage([positions, colors]);
}

load();

onmessage = function (message) {
  let nodePages = message.data[0];
  let nodes = JSON.parse(nodePages);
  let pagesStr = message.data[1];
  let pages = JSON.parse(pagesStr);
  let copcStr = message.data[2];
  let copc = JSON.parse(copcStr);

  let mapIndex = message.data[3];
  let pointCount = message.data[4];
  let myRoot = nodes[mapIndex];
  x_min = message.data[5][0];
  y_min = message.data[5][1];
  z_min = message.data[5][2];
  widthx = message.data[5][3];
  widthy = message.data[5][4];
  widthz = message.data[5][5];
  loadData(nodes, pages, copc, myRoot, pointCount);
};
