import * as Octree from "./octree";

function fillArray(nodes, count, WIDTH, HEIGHT, DEPTH) {
  for (let i = 0; i < count; i++) {
    let node = new Octree.Node(
      i,
      Math.floor(Math.random() * WIDTH) - WIDTH / 2,
      Math.floor(Math.random() * HEIGHT) - HEIGHT / 2,
      Math.floor(Math.random() * DEPTH) - DEPTH / 2
    );
    nodes.push(node);
  }
}

function fillMidNodes(tree) {
  if (!tree.isDivided) {
    tree.points.splice(0, 1);
    return tree.points[0];
  }

  let children = [
    tree.minNE,
    tree.minNW,
    tree.minSW,
    tree.minSE,
    tree.maxNE,
    tree.maxNW,
    tree.maxSW,
    tree.maxSE,
  ];
  let result = [];
  for (let i = 0, _length = children.length; i < _length; i++) {
    let result1 = fillMidNodes(children[i]);
    if (result1 != null) {
      result.push(result1);
    }
  }
  let passIndex = Math.ceil(result.length / 2);
  let passingValue = result[passIndex];
  if (tree.level > 0) {
    result.splice(passIndex, 1);
  }
  tree.representativeNodes = [...result];
  return passingValue;
}

export { fillArray, fillMidNodes };
