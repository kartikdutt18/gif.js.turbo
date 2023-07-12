const Throttler = require("./throttler");
const EventEmitter = require('events');

const defaultGifConfig = {
  workerScript: "gif.worker.js",
  workers: 2,
  repeat: 0, // repeat forever, -1 = repeat once
  background: "#fff",
  quality: 10, // pixel sample interval, lower is better
  width: null, // size derermined from first frame if possible
  height: null,
  transparent: null,
  debug: false,
  useTransferFrame: false,
};

const defaultFrameConfig = {
  delay: 500,
  copy: false,
  applyCropOptimization: false,
  transparencyDifferenceThreshold: 1,
  applyTransparencyOptimization: false,
  dispose: -1,
  isLastFrame: false,
};

class GIF extends EventEmitter {
  constructor(options) {
    super();
    this.freeWorkers = [];
    this.activeWorkers = [];
    this.gifConfig = { ...defaultGifConfig, ...options };
    // This can be more but we keep queue size fixed here so
    // that we dont have to manage task queue.
    this.queueSize = Math.max(this.gifConfig.workers, 1);
    this.spawnWorkers();
    this.throttler = new Throttler(this.gifConfig.workers);
    this.nextFrame = 0;
    this.imageParts = [];
    this.previousFrame = null;
  }

  spawnWorkers() {
    for (let i = 0; i < this.gifConfig.workers; i++) {
      const worker = new Worker(this.gifConfig.workerScript);
      const messageHandler = (event) => {
        const index = this.activeWorkers.indexOf(worker);
        if (index !== -1) {
          this.activeWorkers.splice(index, 1);
        }

        this.freeWorkers.push(worker);
        this.frameFinished(event.data);
      };

      worker.onmessage = messageHandler;
      this.freeWorkers.push(worker);
    }
  }

  async addFrame(image, options) {
    let frame = { ...defaultFrameConfig, ...options };
    frame.transparent = this.gifConfig.transparent;
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!this.gifConfig.width) {
      this.gifConfig.width = image.width;
    }
    if (!this.gifConfig.height) {
      this.gifConfig.height = image.height;
    }

    frame = this.getFrameData(image, frame, options);

    await this.throttler.wait();
    this.render(
      frame,
      this.previousFrame,
      options.isLastFrame ?? false
    );

    if (this.gifConfig.applyTransparencyOptimization) {
      this.previousFrame = frame;
    }

    this.emit('progress', 0)
  }

  render(frame, previousFrame, isLastFrame = false) {
    if (!this.gifConfig.width || !this.gifConfig.height) {
      throw new Error("Width and height must be set prior to rendering");
    }

    if (this.freeWorkers.length === 0) {
      throw new Error("No workers available");
    }

    this.imageParts.push(null);
    const worker = this.freeWorkers.shift();
    const task = this.getTask(
      this.nextFrame++,
      frame,
      previousFrame,
      isLastFrame
    );
    this.activeWorkers.push(worker);
    if (this.gifConfig.useTransferFrame && task.previousFrameData) {
      worker.postMessage(task, [task.previousFrameData.buffer]);
    } else {
      worker.postMessage(task);
    }
  }

  abort() {
    for (let i = 0; i < this.freeWorkers.length; i++) {
      this.freeWorkers[i].terminate();
    }
    for (let i = 0; i < this.activeWorkers.length; i++) {
      this.activeWorkers[i].terminate();
    }
    this.emit('abort')
  }

  getTask(index, frame, previousFrame, isLastFrame) {
    return {
      index: index,
      last: isLastFrame,
      delay: frame.delay,
      transparent: frame.transparent,
      width: this.gifConfig.width,
      height: this.gifConfig.height,
      quality: this.gifConfig.quality,
      dither: this.gifConfig.dither,
      globalPalette: this.gifConfig.globalPalette,
      repeat: this.gifConfig.repeat,
      canTransfer: true,
      data: this.getFrameDataForTask(frame),
      applyCropOptimization: this.gifConfig.applyCropOptimization,
      transparencyDifferenceThreshold:
        this.gifConfig.transparencyDifferenceThreshold,
      dispose: this.gifConfig.dispose,
      applyTransparencyOptimization:
        this.gifConfig.applyTransparencyOptimization,
      previousFrameData: previousFrame
        ? this.getFrameDataForTask(previousFrame)
        : null,
    };
  }

  getContextData(ctx) {
    return ctx.getImageData(0, 0, this.gifConfig.width, this.gifConfig.height).data;
  }

  getFrameDataForTask(frame) {
    if (frame.data) {
      return frame.data;
    } else if (frame.context) {
      return this.getContextData(frame.context);
    } else if (frame.image) {
      return this.getImageData(frame.image);
    } else {
      throw new Error("Invalid frame");
    }
  }

  frameFinished(frame) {
    if (this.imageParts[frame.index] !== null) {
      return;
    }

    this.imageParts[frame.index] = frame;

    if (this.gifConfig.options === true && !duplicate) {
      this.gifConfig.globalPalette = frame.globalPalette;
    }

    this.throttler.notify();
    this.emit('progress');
  }

  async flush() {
    await this.throttler.ensureEmpty();
    var len = 0;
    for (var frameIndex in this.imageParts) {
      var frame = this.imageParts[frameIndex];
      len += (frame.data.length - 1) * frame.pageSize + frame.cursor;
    }
    len += frame.pageSize - frame.cursor;

    var data = new Uint8Array(len);
    var offset = 0;
    for (var frameIndex in this.imageParts) {
      var frame = this.imageParts[frameIndex];
      for (var i in frame.data) {
        var page = frame.data[i];
        data.set(page, offset);
        if (i == frame.data.length - 1) {
          offset += frame.cursor;
        } else {
          offset += frame.pageSize;
        }
      }
    }

    var image = new Blob([data], { type: "image/gif" });
    this.emit('finished', image, data)
    return image;
  }

  getFrameData(image, frame, options = {}) {
    if (typeof ImageData !== "undefined" && image instanceof ImageData) {
      frame.data = image.data;
    } else if (
      (typeof CanvasRenderingContext2D !== "undefined" &&
        image instanceof CanvasRenderingContext2D) ||
      (typeof WebGLRenderingContext !== "undefined" &&
        image instanceof WebGLRenderingContext)
    ) {
      if (options.copy) {
        frame.data = this.getContextData(image);
      } else {
        frame.context = image;
      }
    } else if (image.childNodes) {
      if (options.copy) {
        frame.data = this.getImageData(image);
      } else {
        frame.image = image;
      }
    } else {
      throw new Error("Invalid image");
    }
    return frame;
  }

  getImageData(image) {
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._canvas.width = this.gifConfig.width;
      this._canvas.height = this.gifConfig.height;
    }

    var ctx = this._canvas.getContext("2d");
    ctx.setFill = this.gifConfig.background;
    ctx.fillRect(0, 0, this.gifConfig.width, this.gifConfig.height);
    ctx.drawImage(image, 0, 0);

    return this.getContextData(ctx);
  }
}

module.exports = GIF;
