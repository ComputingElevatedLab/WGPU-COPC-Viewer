import Worker from "./fetcher.worker.js";
import { loadCOPC } from "../index";

const workers = new Array(5).fill(null);
for (let i = 0; i < workers.length; i++) {
  const fetchWorker = new Worker();
  fetchWorker.onmessage = (event) => {
    postMessageRes = event.data;
    if (postMessageRes == 200) {
      loadCOPC();
    } else {
      console.log("received");
      let position = postMessageRes[0];
      let color = postMessageRes[1];
      for (let i = 0; i < position.length; i++) {
        positions.push(position[i]);
        colors.push(colors[i]);
      }
    }
  };
  workers.push(fetchWorker);
}
