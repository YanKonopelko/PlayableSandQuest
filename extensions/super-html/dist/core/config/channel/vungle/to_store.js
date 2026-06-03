window.ToStore = function (auto = false) {
    if (auto) {
        console.log("complete");
        parent.postMessage("complete", "*");
    }
    else {
        console.log("download");
        parent.postMessage("download", "*");
    }
};
