import * as Octree from "./octree";

function fillArray(nodes, count, WIDTH, HEIGHT, DEPTH) {
  for (let i = 0; i < count; i++) {
    let node = new Octree.Node(
      i,
      Math.floor(Math.random() * WIDTH) - WIDTH / 2,
      Math.floor(Math.random() * HEIGHT) - HEIGHT / 2,
      Math.floor(Math.random() * DEPTH)
    );
    nodes.push(node);
  }
}

export { fillArray };
