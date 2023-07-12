/*
  GIFEncoder.js

  Authors
  Kevin Weiner (original Java version - kweiner@fmsware.com)
  Thibault Imbert (AS3 version - bytearray.org)
  Johan Nordberg (JS version - code@johan-nordberg.com)
*/

var NeuQuant = require("./TypedNeuQuant.js");
var LZWEncoder = require("./LZWEncoder.js");

function ByteArray() {
  this.page = -1;
  this.pages = [];
  this.newPage();
}

function getImagePixelsFromFrame(data, w, h) {
  var pixels = new Uint8Array(w * h * 3);
  var srcPos = 0;
  var count = 0;

  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      pixels[count++] = data[srcPos++];
      pixels[count++] = data[srcPos++];
      pixels[count++] = data[srcPos++];
      srcPos++;
    }
  }

  return pixels;
}

function getL2RGBDistance(frame1, frame2, startIdx) {
  const squareVal = function (x) {
    return x * x;
  };

  return squareVal(frame1[startIdx] - frame2[startIdx]) +
    squareVal(frame1[startIdx + 1] - frame2[startIdx + 1]) +
    squareVal(frame1[startIdx + 2] - frame2[startIdx + 2]);
}

function getRGBDistance(frame1, frame2, startIdx) {
  return Math.abs(frame1[startIdx] - frame2[startIdx]) +
    Math.abs(frame1[startIdx + 1] - frame2[startIdx + 1]) +
    Math.abs(frame1[startIdx + 2] - frame2[startIdx + 2])
}

ByteArray.pageSize = 4096;
ByteArray.charMap = {};

for (var i = 0; i < 256; i++) ByteArray.charMap[i] = String.fromCharCode(i);

ByteArray.prototype.newPage = function () {
  this.pages[++this.page] = new Uint8Array(ByteArray.pageSize);
  this.cursor = 0;
};

ByteArray.prototype.getData = function () {
  var rv = "";
  for (var p = 0; p < this.pages.length; p++) {
    for (var i = 0; i < ByteArray.pageSize; i++) {
      rv += ByteArray.charMap[this.pages[p][i]];
    }
  }
  return rv;
};

ByteArray.prototype.writeByte = function (val) {
  if (this.cursor >= ByteArray.pageSize) this.newPage();
  this.pages[this.page][this.cursor++] = val;
};

ByteArray.prototype.writeUTFBytes = function (string) {
  for (var l = string.length, i = 0; i < l; i++)
    this.writeByte(string.charCodeAt(i));
};

ByteArray.prototype.writeBytes = function (array, offset, length) {
  for (var l = length || array.length, i = offset || 0; i < l; i++)
    this.writeByte(array[i]);
};

function GIFEncoder(width, height) {
  // image size
  this.width = ~~width;
  this.height = ~~height;

  // transparent color if given
  this.transparent = null;

  // transparent index in color table
  this.transIndex = 0;

  // -1 = no repeat, 0 = forever. anything else is repeat count
  this.repeat = -1;

  // frame delay (hundredths)
  this.delay = 0;

  this.image = null; // current frame
  this.pixels = null; // BGR byte array from frame
  this.indexedPixels = null; // converted frame indexed to palette
  this.colorDepth = null; // number of bit planes
  this.colorTab = null; // RGB palette
  this.neuQuant = null; // NeuQuant instance that was used to generate this.colorTab.
  this.usedEntry = new Array(); // active palette entries
  this.palSize = 7; // color table size (bits-1)
  this.dispose = -1; // disposal code (-1 = use default)
  this.firstFrame = true;
  this.sample = 10; // default sample interval for quantizer
  this.dither = false; // default dithering
  this.globalPalette = false;
  this.transIndexValue = Math.pow(2, this.palSize + 1) - 1;

  this.applyCropOptimization = false;
  this.transparencyDifferenceThreshold = 1;
  this.applyTransparencyOptimization = false;
  this.xOffset = 0;
  this.yOffset = 0;
  this.yEnd = this.height - 1;
  this.xEnd = this.width - 1;

  this.out = new ByteArray();
}

/*
  Sets the value for applyTransparencyOptimization.
*/
GIFEncoder.prototype.setApplyTransparencyOptimization = function (optimize) {
  this.applyTransparencyOptimization = optimize;
};

/*
  Sets the value for transparencyDifferenceThreshold.
*/
GIFEncoder.prototype.setTransparencyDifferenceThreshold = function (threshold) {
  this.transparencyDifferenceThreshold = threshold;
};

/*
  Sets the value for applyCropOptimization.
*/
GIFEncoder.prototype.setApplyCropOptimization = function (optimize) {
  this.applyCropOptimization = optimize;
};

/*
  Sets the delay time between each frame, or changes it for subsequent frames
  (applies to last frame added)
*/
GIFEncoder.prototype.setDelay = function (milliseconds) {
  this.delay = Math.round(milliseconds / 10);
};

/*
  Sets frame rate in frames per second.
*/
GIFEncoder.prototype.setFrameRate = function (fps) {
  this.delay = Math.round(100 / fps);
};

/*
  Sets the GIF frame disposal code for the last added frame and any
  subsequent frames.

  Default is 0 if no transparent color has been set, otherwise 2.
*/
GIFEncoder.prototype.setDispose = function (disposalCode) {
  if (disposalCode >= 0) this.dispose = disposalCode;
};

/*
  Sets the number of times the set of GIF frames should be played.

  -1 = play once
  0 = repeat indefinitely

  Default is -1

  Must be invoked before the first image is added
*/

GIFEncoder.prototype.setRepeat = function (repeat) {
  this.repeat = repeat;
};

/*
  Sets the transparent color for the last added frame and any subsequent
  frames. Since all colors are subject to modification in the quantization
  process, the color in the final palette for each frame closest to the given
  color becomes the transparent color for that frame. May be set to null to
  indicate no transparent color.
*/
GIFEncoder.prototype.setTransparent = function (color) {
  this.transparent = color;
};

/*
  Adds next GIF frame. The frame is not written immediately, but is
  actually deferred until the next frame is received so that timing
  data can be inserted.  Invoking finish() flushes all frames.
*/
GIFEncoder.prototype.addFrame = function (imageData, previousImageData) {
  this.image = imageData;

  this.colorTab =
    this.globalPalette && this.globalPalette.slice ? this.globalPalette : null;

  this.getImagePixels(); // convert to correct format if necessary
  var previousFramePixels = null;
  if (previousImageData) {
    previousFramePixels = getImagePixelsFromFrame(previousImageData, this.width, this.height);
  }

  this.analyzePixels(previousFramePixels);
  if (this.globalPalette === true) this.globalPalette = this.colorTab;

  if (this.firstFrame) {
    this.writeLSD(); // logical screen descriptior
    this.writePalette(); // global color table
    if (this.repeat >= 0) {
      // use NS app extension to indicate reps
      this.writeNetscapeExt();
    }
  }

  this.writeGraphicCtrlExt(); // write graphic control extension
  this.writeImageDesc(); // image descriptor
  if (!this.firstFrame && !this.globalPalette) this.writePalette(); // local color table
  this.writePixels(); // encode and write pixel data

  this.firstFrame = false;
};

/*
  Adds final trailer to the GIF stream, if you don't call the finish method
  the GIF stream will not be valid.
*/
GIFEncoder.prototype.finish = function () {
  this.out.writeByte(0x3b); // gif trailer
};

/*
  Sets quality of color quantization (conversion of images to the maximum 256
  colors allowed by the GIF specification). Lower values (minimum = 1)
  produce better colors, but slow processing significantly. 10 is the
  default, and produces good color mapping at reasonable speeds. Values
  greater than 20 do not yield significant improvements in speed.
*/
GIFEncoder.prototype.setQuality = function (quality) {
  if (quality < 1) quality = 1;
  this.sample = quality;
};

/*
  Sets dithering method. Available are:
  - FALSE no dithering
  - TRUE or FloydSteinberg
  - FalseFloydSteinberg
  - Stucki
  - Atkinson
  You can add '-serpentine' to use serpentine scanning
*/
GIFEncoder.prototype.setDither = function (dither) {
  if (dither === true) dither = "FloydSteinberg";
  this.dither = dither;
};

/*
  Sets global palette for all frames.
  You can provide TRUE to create global palette from first picture.
  Or an array of r,g,b,r,g,b,...
*/
GIFEncoder.prototype.setGlobalPalette = function (palette) {
  this.globalPalette = palette;
};

/*
  Returns global palette used for all frames.
  If setGlobalPalette(true) was used, then this function will return
  calculated palette after the first frame is added.
*/
GIFEncoder.prototype.getGlobalPalette = function () {
  return (
    (this.globalPalette &&
      this.globalPalette.slice &&
      this.globalPalette.slice(0)) ||
    this.globalPalette
  );
};

/*
  Writes GIF file header
*/
GIFEncoder.prototype.writeHeader = function () {
  this.out.writeUTFBytes("GIF89a");
};

/*
  Analyzes current frame colors and creates color map.
*/
GIFEncoder.prototype.analyzePixels = function (previousFramePixels) {
  if (!this.colorTab) {
    this.neuQuant = new NeuQuant(this.pixels, this.sample, true);
    this.neuQuant.buildColormap(); // create reduced palette
    this.colorTab = this.neuQuant.getColormap();
  }

  // map image pixels to new palette
  if (this.dither) {
    this.ditherPixels(
      this.dither.replace("-serpentine", ""),
      this.dither.match(/-serpentine/) !== null,
      previousFramePixels
    );
  } else {
    this.indexPixels(previousFramePixels);
  }

  if (this.applyCropOptimization && previousFramePixels) {
      this.cropIndexedPixels();
  }

  this.pixels = null;
  this.colorDepth = 8;
  this.palSize = 7;

  // get closest match to transparent color if specified
  if (this.applyTransparencyOptimization) {
    this.transIndex = this.transIndexValue;
  }
  else if (this.transparent !== null) {
    this.transIndex = this.findClosest(this.transparent, true);
  }
};

/*
  Index pixels, without dithering
  This method is most expensive (75% of time) because of calls to findClosestRGB, and findClosestRGB should be optimized.
*/
GIFEncoder.prototype.indexPixels = function (previousFrame) {
  var nPix = this.pixels.length / 3;
  this.indexedPixels = new Uint8Array(nPix);
  var k = 0;
  var pixelsSameInTheFrame = 0
  for (var j = 0; j < nPix; j++) {
    var index = -1;
    // Only execute if transparent option available.
    if (previousFrame && getRGBDistance(this.pixels, previousFrame, k) < this.transparencyDifferenceThreshold) {
      pixelsSameInTheFrame = pixelsSameInTheFrame + 1
      index = this.transIndexValue;
      k = k + 3
    }

    if (index == -1) {
      index = this.findClosestRGB(
        this.pixels[k++] & 0xff,
        this.pixels[k++] & 0xff,
        this.pixels[k++] & 0xff
      );
    }

    this.usedEntry[index] = true;
    this.indexedPixels[j] = index;
  }
};

GIFEncoder.prototype.cropIndexedPixels = function() {
  // Crop Top.
  while (this.yOffset < this.yEnd) {
    var isTransparent = true;
    for (var i = 0; i < this.width; i++) {
      if (this.indexedPixels[this.width * this.yOffset + i] !== this.transIndexValue) {
        isTransparent = false;
        break;
      }
    }

    if (!isTransparent) {
      break;
    }

    this.yOffset++;
  }

  // bottom cropping.
  while (this.yEnd > this.yOffset) {
    var isTransparent = true;
    for (var i = 0; i < this.width; i++) {
      if (this.indexedPixels[this.width * this.yEnd + i]  !== this.transIndexValue) {
        isTransparent = false;
        break;
      }
    }

    if (!isTransparent) {
      break;
    }

    this.yEnd--;
  }

  while (this.xOffset < this.xEnd) {
    var isTransparent = true;
    for (var i = this.yOffset; i < this.yEnd; i++) {
      if (this.indexedPixels[this.width * i + this.xOffset] !== this.transIndexValue) {
        isTransparent = false;
        break;
      }
    }

    if (!isTransparent) {
      break;
    }

    this.xOffset++;
  }

  while (this.xEnd > this.xOffset) {
    var isTransparent = true;
    for (var i = this.yOffset; i < this.yEnd; i++) {
      if (this.indexedPixels[this.width * i + this.xEnd] !== this.transIndexValue) {
        isTransparent = false;
        break;
      }
    }

    if (!isTransparent) {
      break;
    }

    this.xEnd--;
  }

  return;
}

GIFEncoder.prototype.calculateAndPropogateErrorDither = function (frame, x, y, kernel, serpentine) {
  var kernels = {
    FalseFloydSteinberg: [
      [3 / 8, 1, 0],
      [3 / 8, 0, 1],
      [2 / 8, 1, 1],
    ],
    FloydSteinberg: [
      [7 / 16, 1, 0],
      [3 / 16, -1, 1],
      [5 / 16, 0, 1],
      [1 / 16, 1, 1],
    ],
    Stucki: [
      [8 / 42, 1, 0],
      [4 / 42, 2, 0],
      [2 / 42, -2, 1],
      [4 / 42, -1, 1],
      [8 / 42, 0, 1],
      [4 / 42, 1, 1],
      [2 / 42, 2, 1],
      [1 / 42, -2, 2],
      [2 / 42, -1, 2],
      [4 / 42, 0, 2],
      [2 / 42, 1, 2],
      [1 / 42, 2, 2],
    ],
    Atkinson: [
      [1 / 8, 1, 0],
      [1 / 8, 2, 0],
      [1 / 8, -1, 1],
      [1 / 8, 0, 1],
      [1 / 8, 1, 1],
      [1 / 8, 0, 2],
    ],
  };

  if (!kernel || !kernels[kernel]) {
    throw "Unknown dithering kernel: " + kernel;
  }

  var ds = kernels[kernel];
  var direction = serpentine ? -1 : 1;
  var index = y * this.width + x;

  // Get original colour
  var k = index * 3;
  var r1 = frame[k];
  var g1 = frame[k + 1];
  var b1 = frame[k + 2];

  // Get converted colour
  // Gives me a value between 0 to 255 corresponding to index.
  var idx = this.findClosestRGB(r1, g1, b1);
  // Multiply by 3 because color tab will have r.g.b.
  k = idx * 3;
  var r2 = this.colorTab[k];
  var g2 = this.colorTab[k + 1];
  var b2 = this.colorTab[k + 2];

  // calculate error.
  var er = r1 - r2;
  var eg = g1 - g2;
  var eb = b1 - b2;

  for (
    var i = direction == 1 ? 0 : ds.length - 1,
    end = direction == 1 ? ds.length : 0;
    i !== end;
    i += direction
  ) {
      var x1 = ds[i][1]; // *direction;  //  Should this by timesd by direction?..to make the kernel go in the opposite direction....got no idea....
      var y1 = ds[i][2];
      if (x1 + x >= 0 && x1 + x < this.width && y1 + y >= 0 && y1 + y < this.height) {
        var d = ds[i][0];
        k = index + x1 + y1 * this.width;
        k *= 3;
        // updated the error in data.
        frame[k] = Math.max(0, Math.min(255, frame[k] + er * d));
        frame[k + 1] = Math.max(0, Math.min(255, frame[k + 1] + eg * d));
        frame[k + 2] = Math.max(0, Math.min(255, frame[k + 2] + eb * d));
      }
  }

  return idx;
}
/*
  Taken from http://jsbin.com/iXofIji/2/edit by PAEz
*/
GIFEncoder.prototype.ditherPixels = function (kernel, serpentine, previousFrame) {
  var index = 0,
    height = this.height,
    width = this.width,
    data = this.pixels;
  var direction = serpentine ? -1 : 1;

  this.indexedPixels = new Uint8Array(this.pixels.length / 3);

  for (var y = 0; y < height; y++) {
    if (serpentine) direction = direction * -1;

    for (
      var x = direction == 1 ? 0 : width - 1, xend = direction == 1 ? width : 0;
      x !== xend;
      x += direction
    ) {
      index = y * width + x;
      var idx = this.calculateAndPropogateErrorDither(this.pixels, x, y, kernel, serpentine);
      if (previousFrame) {
        var prevFrameIdx = this.calculateAndPropogateErrorDither(previousFrame, x, y, kernel, serpentine);
        if (idx === prevFrameIdx || getL2RGBDistance(this.pixels, previousFrame, index * 3) < (this.transparencyDifferenceThreshold * this.transparencyDifferenceThreshold)) {
          idx = this.transIndexValue;
        }
      }

      this.usedEntry[idx] = true;
      this.indexedPixels[index] = idx;
    }
  }
};

/*
  Returns index of palette color closest to c
*/
GIFEncoder.prototype.findClosest = function (c, used) {
  return this.findClosestRGB(
    (c & 0xff0000) >> 16,
    (c & 0x00ff00) >> 8,
    c & 0x0000ff,
    used
  );
};

// Should be heavily optimized
GIFEncoder.prototype.findClosestRGB = function (r, g, b, used) {
  if (this.colorTab === null) return -1;

  if (this.neuQuant && !used) {
    return this.neuQuant.lookupRGB(r, g, b);
  }

  var c = b | (g << 8) | (r << 16);

  var minpos = 0;
  var dmin = 256 * 256 * 256;
  var len = this.colorTab.length;

  for (var i = 0, index = 0; i < len; index++) {
    var dr = r - (this.colorTab[i++] & 0xff);
    var dg = g - (this.colorTab[i++] & 0xff);
    var db = b - (this.colorTab[i++] & 0xff);
    var d = dr * dr + dg * dg + db * db;
    if ((!used || this.usedEntry[index]) && d < dmin) {
      dmin = d;
      minpos = index;
    }
  }

  return minpos;
};

/*
  Extracts image pixels into byte array pixels
  (removes alphachannel from canvas imagedata)
*/
GIFEncoder.prototype.getImagePixels = function () {
  var w = this.width;
  var h = this.height;
  this.pixels = new Uint8Array(w * h * 3);

  var data = this.image;
  var srcPos = 0;
  var count = 0;

  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      this.pixels[count++] = data[srcPos++];
      this.pixels[count++] = data[srcPos++];
      this.pixels[count++] = data[srcPos++];
      srcPos++;
    }
  }
};

/*
  Writes Graphic Control Extension
*/
GIFEncoder.prototype.writeGraphicCtrlExt = function () {
  this.out.writeByte(0x21); // extension introducer
  this.out.writeByte(0xf9); // GCE label
  this.out.writeByte(4); // data block size

  var transp, disp;
  if (this.transparent === null) {
    transp = 0;
    disp = 0; // dispose = no action
  } else {
    transp = 1;
    disp = 2; // force clear if using transparent color
  }

  if (this.applyTransparencyOptimization) {
    disp = 1;
    transp = 1;
  }

  if (this.dispose >= 0) {
    disp = this.dispose & 7; // user override
  }
  disp <<= 2;

  // packed fields
  this.out.writeByte(
    0 | // 1:3 reserved
      disp | // 4:6 disposal
      0 | // 7 user input - 0 = none
      transp // 8 transparency flag
  );

  this.writeShort(this.delay); // delay x 1/100 sec
  this.out.writeByte(this.transIndex); // transparent color index
  this.out.writeByte(0); // block terminator
};

/*
  Writes Image Descriptor
*/
GIFEncoder.prototype.writeImageDesc = function () {
  var height = this.yEnd - this.yOffset + 1;
  var width = this.xEnd - this.xOffset + 1;
  this.out.writeByte(0x2c); // image separator
  this.writeShort(this.xOffset); // image position x,y = 0,0
  this.writeShort(this.yOffset);
  this.writeShort(width); // image size
  this.writeShort(height);

  // packed fields
  if (this.firstFrame || this.globalPalette) {
    // no LCT - GCT is used for first (or only) frame
    this.out.writeByte(0);
  } else {
    // specify normal LCT
    this.out.writeByte(
      0x80 | // 1 local color table 1=yes
        0 | // 2 interlace - 0=no
        0 | // 3 sorted - 0=no
        0 | // 4-5 reserved
        this.palSize // 6-8 size of color table
    );
  }
};

/*
  Writes Logical Screen Descriptor
*/
GIFEncoder.prototype.writeLSD = function () {
  // logical screen size
  this.writeShort(this.width);
  this.writeShort(this.height);

  // packed fields
  this.out.writeByte(
    0x80 | // 1 : global color table flag = 1 (gct used)
      0x70 | // 2-4 : color resolution = 7
      0x00 | // 5 : gct sort flag = 0
      this.palSize // 6-8 : gct size
  );

  this.out.writeByte(0); // background color index
  this.out.writeByte(0); // pixel aspect ratio - assume 1:1
};

/*
  Writes Netscape application extension to define repeat count.
*/
GIFEncoder.prototype.writeNetscapeExt = function () {
  this.out.writeByte(0x21); // extension introducer
  this.out.writeByte(0xff); // app extension label
  this.out.writeByte(11); // block size
  this.out.writeUTFBytes("NETSCAPE2.0"); // app id + auth code
  this.out.writeByte(3); // sub-block size
  this.out.writeByte(1); // loop sub-block id
  this.writeShort(this.repeat); // loop count (extra iterations, 0=repeat forever)
  this.out.writeByte(0); // block terminator
};

/*
  Writes color table
*/
GIFEncoder.prototype.writePalette = function () {
  this.out.writeBytes(this.colorTab);
  var n = 3 * 256 - this.colorTab.length;
  for (var i = 0; i < n; i++) this.out.writeByte(0);
};

GIFEncoder.prototype.writeShort = function (pValue) {
  this.out.writeByte(pValue & 0xff);
  this.out.writeByte((pValue >> 8) & 0xff);
};

/*
  Encodes and writes pixel data
*/
GIFEncoder.prototype.writePixels = function () {
  // trim indexedPixels here.
  var height = this.yEnd - this.yOffset + 1;
  var width = this.xEnd - this.xOffset + 1;
  var indexedPixels = new Uint8Array(width * height);
  var curOffset = 0;
  for (var i = this.yOffset; i <= this.yEnd; i++) {
    indexedPixels.set(
      this.indexedPixels.slice(
        i * this.width + this.xOffset,
        i * this.width + this.xOffset + width
      ),
      curOffset
    );
    curOffset += width;
  }

  var enc = new LZWEncoder(
    width,
    height,
    indexedPixels,
    this.colorDepth
  );
  enc.encode(this.out);
};

/*
  Retrieves the GIF stream
*/
GIFEncoder.prototype.stream = function () {
  return this.out;
};

module.exports = GIFEncoder;
