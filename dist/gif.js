!function(e,t){if("object"==typeof exports&&"object"==typeof module)module.exports=t();else if("function"==typeof define&&define.amd)define([],t);else{var i=t();for(var r in i)("object"==typeof exports?exports:e)[r]=i[r]}}(self,(()=>{return e={764:e=>{e.exports=class{constructor(){this.pending=[],this.closed=!1,this.inErrorState=!1,this.error=null}wait(){return this.inErrorState?Promise.reject(this.error):this.closed?Promise.resolve(void 0):new Promise(((e,t)=>{this.pending.push({resolve:e,reject:t})}))}notifyOne(){this.pending.length>0&&this.pending.shift()?.resolve()}notifyAll(){this.pending.forEach((e=>e.resolve())),this.pending=[]}rejectAll(e){this.inErrorState=!0,this.error=e,this.pending.forEach((t=>t.reject(e))),this.pending=[]}close(){this.notifyAll(),this.closed=!0}}},503:(e,t,i)=>{const r=i(373),n=i(187),s={workerScript:"gif.worker.js",workers:2,repeat:0,background:"#fff",quality:10,width:null,height:null,transparent:null,debug:!1,useTransferFrame:!1},o={delay:500,copy:!1,applyCropOptimization:!1,transparencyDifferenceThreshold:1,applyTransparencyOptimization:!1,dispose:-1,isLastFrame:!1};e.exports=class extends n{constructor(e){super(),this.freeWorkers=[],this.activeWorkers=[],this.gifConfig={...s,...e},this.queueSize=Math.max(this.gifConfig.workers,1),this.spawnWorkers(),this.throttler=new r(this.gifConfig.workers),this.nextFrame=0,this.imageParts=[],this.previousFrame=null}spawnWorkers(){for(let e=0;e<this.gifConfig.workers;e++){const e=new Worker(this.gifConfig.workerScript),t=t=>{const i=this.activeWorkers.indexOf(e);-1!==i&&this.activeWorkers.splice(i,1),this.freeWorkers.push(e),this.frameFinished(t.data)};e.onmessage=t,this.freeWorkers.push(e)}}async addFrame(e,t){let i={...o,...t};i.transparent=this.gifConfig.transparent,await new Promise((e=>setTimeout(e,100))),this.gifConfig.width||(this.gifConfig.width=e.width),this.gifConfig.height||(this.gifConfig.height=e.height),i=this.getFrameData(e,i,t),await this.throttler.wait(),this.render(i,this.previousFrame,t.isLastFrame??!1),this.gifConfig.applyTransparencyOptimization&&(this.previousFrame=i),this.emit("progress",0)}render(e,t,i=!1){if(!this.gifConfig.width||!this.gifConfig.height)throw new Error("Width and height must be set prior to rendering");if(0===this.freeWorkers.length)throw new Error("No workers available");this.imageParts.push(null);const r=this.freeWorkers.shift(),n=this.getTask(this.nextFrame++,e,t,i);this.activeWorkers.push(r),this.gifConfig.useTransferFrame&&n.previousFrameData?r.postMessage(n,[n.previousFrameData.buffer]):r.postMessage(n)}abort(){for(let e=0;e<this.freeWorkers.length;e++)this.freeWorkers[e].terminate();for(let e=0;e<this.activeWorkers.length;e++)this.activeWorkers[e].terminate();this.emit("abort")}getTask(e,t,i,r){return{index:e,last:r,delay:t.delay,transparent:t.transparent,width:this.gifConfig.width,height:this.gifConfig.height,quality:this.gifConfig.quality,dither:this.gifConfig.dither,globalPalette:this.gifConfig.globalPalette,repeat:this.gifConfig.repeat,canTransfer:!0,data:this.getFrameDataForTask(t),applyCropOptimization:this.gifConfig.applyCropOptimization,transparencyDifferenceThreshold:this.gifConfig.transparencyDifferenceThreshold,dispose:this.gifConfig.dispose,applyTransparencyOptimization:this.gifConfig.applyTransparencyOptimization,previousFrameData:i?this.getFrameDataForTask(i):null}}getContextData(e){return e.getImageData(0,0,this.gifConfig.width,this.gifConfig.height).data}getFrameDataForTask(e){if(e.data)return e.data;if(e.context)return this.getContextData(e.context);if(e.image)return this.getImageData(e.image);throw new Error("Invalid frame")}frameFinished(e){null===this.imageParts[e.index]&&(this.imageParts[e.index]=e,!0!==this.gifConfig.options||duplicate||(this.gifConfig.globalPalette=e.globalPalette),this.throttler.notify(),this.emit("progress"))}async flush(){await this.throttler.ensureEmpty();var e=0;for(var t in this.imageParts)e+=((n=this.imageParts[t]).data.length-1)*n.pageSize+n.cursor;e+=n.pageSize-n.cursor;var i=new Uint8Array(e),r=0;for(var t in this.imageParts){var n=this.imageParts[t];for(var s in n.data){var o=n.data[s];i.set(o,r),s==n.data.length-1?r+=n.cursor:r+=n.pageSize}}var a=new Blob([i],{type:"image/gif"});return this.emit("finished",a,i),a}getFrameData(e,t,i={}){if("undefined"!=typeof ImageData&&e instanceof ImageData)t.data=e.data;else if("undefined"!=typeof CanvasRenderingContext2D&&e instanceof CanvasRenderingContext2D||"undefined"!=typeof WebGLRenderingContext&&e instanceof WebGLRenderingContext)i.copy?t.data=this.getContextData(e):t.context=e;else{if(!e.childNodes)throw new Error("Invalid image");i.copy?t.data=this.getImageData(e):t.image=e}return t}getImageData(e){this._canvas||(this._canvas=document.createElement("canvas"),this._canvas.width=this.gifConfig.width,this._canvas.height=this.gifConfig.height);var t=this._canvas.getContext("2d");return t.setFill=this.gifConfig.background,t.fillRect(0,0,this.gifConfig.width,this.gifConfig.height),t.drawImage(e,0,0),this.getContextData(t)}}},373:(e,t,i)=>{var r=i(764);e.exports=class{constructor(e){this.maxPending=e,this.pendingCount=0,this.full=new r}async wait(){for(;this.pendingCount>=this.maxPending;)await this.full.wait();this.pendingCount++}async ensureEmpty(){for(;0!=this.pendingCount;)await this.full.wait()}notify(){this.pendingCount--,this.full.notifyOne()}}},187:e=>{"use strict";var t,i="object"==typeof Reflect?Reflect:null,r=i&&"function"==typeof i.apply?i.apply:function(e,t,i){return Function.prototype.apply.call(e,t,i)};t=i&&"function"==typeof i.ownKeys?i.ownKeys:Object.getOwnPropertySymbols?function(e){return Object.getOwnPropertyNames(e).concat(Object.getOwnPropertySymbols(e))}:function(e){return Object.getOwnPropertyNames(e)};var n=Number.isNaN||function(e){return e!=e};function s(){s.init.call(this)}e.exports=s,e.exports.once=function(e,t){return new Promise((function(i,r){function n(i){e.removeListener(t,s),r(i)}function s(){"function"==typeof e.removeListener&&e.removeListener("error",n),i([].slice.call(arguments))}d(e,t,s,{once:!0}),"error"!==t&&function(e,t,i){"function"==typeof e.on&&d(e,"error",t,{once:!0})}(e,n)}))},s.EventEmitter=s,s.prototype._events=void 0,s.prototype._eventsCount=0,s.prototype._maxListeners=void 0;var o=10;function a(e){if("function"!=typeof e)throw new TypeError('The "listener" argument must be of type Function. Received type '+typeof e)}function h(e){return void 0===e._maxListeners?s.defaultMaxListeners:e._maxListeners}function f(e,t,i,r){var n,s,o,f;if(a(i),void 0===(s=e._events)?(s=e._events=Object.create(null),e._eventsCount=0):(void 0!==s.newListener&&(e.emit("newListener",t,i.listener?i.listener:i),s=e._events),o=s[t]),void 0===o)o=s[t]=i,++e._eventsCount;else if("function"==typeof o?o=s[t]=r?[i,o]:[o,i]:r?o.unshift(i):o.push(i),(n=h(e))>0&&o.length>n&&!o.warned){o.warned=!0;var u=new Error("Possible EventEmitter memory leak detected. "+o.length+" "+String(t)+" listeners added. Use emitter.setMaxListeners() to increase limit");u.name="MaxListenersExceededWarning",u.emitter=e,u.type=t,u.count=o.length,f=u,console&&console.warn&&console.warn(f)}return e}function u(){if(!this.fired)return this.target.removeListener(this.type,this.wrapFn),this.fired=!0,0===arguments.length?this.listener.call(this.target):this.listener.apply(this.target,arguments)}function p(e,t,i){var r={fired:!1,wrapFn:void 0,target:e,type:t,listener:i},n=u.bind(r);return n.listener=i,r.wrapFn=n,n}function l(e,t,i){var r=e._events;if(void 0===r)return[];var n=r[t];return void 0===n?[]:"function"==typeof n?i?[n.listener||n]:[n]:i?function(e){for(var t=new Array(e.length),i=0;i<t.length;++i)t[i]=e[i].listener||e[i];return t}(n):c(n,n.length)}function g(e){var t=this._events;if(void 0!==t){var i=t[e];if("function"==typeof i)return 1;if(void 0!==i)return i.length}return 0}function c(e,t){for(var i=new Array(t),r=0;r<t;++r)i[r]=e[r];return i}function d(e,t,i,r){if("function"==typeof e.on)r.once?e.once(t,i):e.on(t,i);else{if("function"!=typeof e.addEventListener)throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type '+typeof e);e.addEventListener(t,(function n(s){r.once&&e.removeEventListener(t,n),i(s)}))}}Object.defineProperty(s,"defaultMaxListeners",{enumerable:!0,get:function(){return o},set:function(e){if("number"!=typeof e||e<0||n(e))throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received '+e+".");o=e}}),s.init=function(){void 0!==this._events&&this._events!==Object.getPrototypeOf(this)._events||(this._events=Object.create(null),this._eventsCount=0),this._maxListeners=this._maxListeners||void 0},s.prototype.setMaxListeners=function(e){if("number"!=typeof e||e<0||n(e))throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received '+e+".");return this._maxListeners=e,this},s.prototype.getMaxListeners=function(){return h(this)},s.prototype.emit=function(e){for(var t=[],i=1;i<arguments.length;i++)t.push(arguments[i]);var n="error"===e,s=this._events;if(void 0!==s)n=n&&void 0===s.error;else if(!n)return!1;if(n){var o;if(t.length>0&&(o=t[0]),o instanceof Error)throw o;var a=new Error("Unhandled error."+(o?" ("+o.message+")":""));throw a.context=o,a}var h=s[e];if(void 0===h)return!1;if("function"==typeof h)r(h,this,t);else{var f=h.length,u=c(h,f);for(i=0;i<f;++i)r(u[i],this,t)}return!0},s.prototype.addListener=function(e,t){return f(this,e,t,!1)},s.prototype.on=s.prototype.addListener,s.prototype.prependListener=function(e,t){return f(this,e,t,!0)},s.prototype.once=function(e,t){return a(t),this.on(e,p(this,e,t)),this},s.prototype.prependOnceListener=function(e,t){return a(t),this.prependListener(e,p(this,e,t)),this},s.prototype.removeListener=function(e,t){var i,r,n,s,o;if(a(t),void 0===(r=this._events))return this;if(void 0===(i=r[e]))return this;if(i===t||i.listener===t)0==--this._eventsCount?this._events=Object.create(null):(delete r[e],r.removeListener&&this.emit("removeListener",e,i.listener||t));else if("function"!=typeof i){for(n=-1,s=i.length-1;s>=0;s--)if(i[s]===t||i[s].listener===t){o=i[s].listener,n=s;break}if(n<0)return this;0===n?i.shift():function(e,t){for(;t+1<e.length;t++)e[t]=e[t+1];e.pop()}(i,n),1===i.length&&(r[e]=i[0]),void 0!==r.removeListener&&this.emit("removeListener",e,o||t)}return this},s.prototype.off=s.prototype.removeListener,s.prototype.removeAllListeners=function(e){var t,i,r;if(void 0===(i=this._events))return this;if(void 0===i.removeListener)return 0===arguments.length?(this._events=Object.create(null),this._eventsCount=0):void 0!==i[e]&&(0==--this._eventsCount?this._events=Object.create(null):delete i[e]),this;if(0===arguments.length){var n,s=Object.keys(i);for(r=0;r<s.length;++r)"removeListener"!==(n=s[r])&&this.removeAllListeners(n);return this.removeAllListeners("removeListener"),this._events=Object.create(null),this._eventsCount=0,this}if("function"==typeof(t=i[e]))this.removeListener(e,t);else if(void 0!==t)for(r=t.length-1;r>=0;r--)this.removeListener(e,t[r]);return this},s.prototype.listeners=function(e){return l(this,e,!0)},s.prototype.rawListeners=function(e){return l(this,e,!1)},s.listenerCount=function(e,t){return"function"==typeof e.listenerCount?e.listenerCount(t):g.call(e,t)},s.prototype.listenerCount=g,s.prototype.eventNames=function(){return this._eventsCount>0?t(this._events):[]}}},t={},function i(r){var n=t[r];if(void 0!==n)return n.exports;var s=t[r]={exports:{}};return e[r](s,s.exports,i),s.exports}(503);var e,t}));
//# sourceMappingURL=gif.js.map