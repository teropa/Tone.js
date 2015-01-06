define(["Tone/core/Tone"], function(Tone){

	"use strict";

	/**
	 *  @class  Buffer loading and storage. Tone.Buffer will load and store the buffers
	 *          in the same data structure they were given in the argument. If given
	 *          a string, this._buffer will equal an AudioBuffer. If constructed
	 *          with an array, the samples will be placed in an array in the same
	 *          order. 
	 *  
	 *  @constructor 
	 *  @param {AudioBuffer|string} url the url to load, or the audio buffer to set
	 */
	Tone.Buffer = function(){

		var options = this.optionsObject(arguments, ["url", "onload"], Tone.Buffer.defaults);

		/**
		 *  stores the loaded AudioBuffer
		 *  @type {AudioBuffer}
		 *  @private
		 */
		this._buffer = null;

		/**
		 *  the url of the buffer. 
		 *  `undefined` if it was constructed with a buffer
		 *  @type {string}
		 */
		this.url = undefined;

		/**
		 *  the callback to invoke when everything is loaded
		 *  @type {function}
		 */
		this.onload = options.onload;

		if (options.url instanceof AudioBuffer){
			this._buffer.set(options.url);
			this.onload(this);
		} else if (typeof options.url === "string"){
			this.url = options.url;
			Tone.Buffer._addToQueue(options.url, this);
		}
	};

	Tone.extend(Tone.Buffer);

	/**
	 *  the default parameters
	 *
	 *  @static
	 *  @const
	 *  @type {Object}
	 */
	Tone.Buffer.defaults = {
		"url" : undefined,
		"onload" : function(){},
	};

	/**
	 *  set the buffer
	 *  @param {AudioBuffer|Tone.Buffer} buffer the buffer
	 */
	Tone.Buffer.prototype.set = function(buffer){
		if (buffer instanceof Tone.Buffer){
			this._buffer = buffer.get();
		} else {
			this._buffer = buffer;
		}
		return this;
	};

	/**
	 *  @return {AudioBuffer} the audio buffer
	 */
	Tone.Buffer.prototype.get = function(){
		return this._buffer;
	};

	/**
	 *  @param {string} url the url to load
	 *  @param {function=} callback the callback to invoke on load. 
	 *                              don't need to set if `onload` is
	 *                              already set.
	 */
	Tone.Buffer.prototype.load = function(url, callback){
		this.url = url;
		this.onload = this.defaultArg(callback, this.onload);
		Tone.Buffer._addToQueue(url, this);
	};

	/**
	 *  dispose and disconnect
	 */
	Tone.Buffer.prototype.dispose = function(){
		Tone.prototype.dispose.call(this);
		Tone.Buffer._removeFromQueue(this);
		this._buffer = null;
		this.onload = null;
	};

	//defines getter / setter for value
	Object.defineProperty(Tone.Buffer.prototype, "duration", {
		get : function(){
			return this._buffer.duration;
		},
	});

	///////////////////////////////////////////////////////////////////////////
	// STATIC METHODS
	///////////////////////////////////////////////////////////////////////////
	 
	/**
	 *  the static queue for all of the xhr requests
	 *  @type {Array}
	 *  @private
	 */
	Tone.Buffer._queue = [];

	/**
	 *  the array of current downloads
	 *  @type {Array}
	 *  @private
	 */
	Tone.Buffer._currentDownloads = [];

	/**
	 *  the total number of downloads
	 *  @type {number}
	 *  @private
	 */
	Tone.Buffer._totalDownloads = 0;

	/**
	 *  the maximum number of simultaneous downloads
	 *  @static
	 *  @type {number}
	 */
	Tone.Buffer.MAX_SIMULTANEOUS_DOWNLOADS = 6;
	
	/**
	 *  Adds a file to be loaded to the loading queue
	 *  @param   {string}   url      the url to load
	 *  @param   {function} callback the callback to invoke once it's loaded
	 *  @private
	 */
	Tone.Buffer._addToQueue = function(url, buffer){
		Tone.Buffer._queue.push({
			url : url,
			Buffer : buffer,
			progress : 0,
			xhr : null
		});
		this._totalDownloads++;
		Tone.Buffer._next();
	};

	/**
	 *  Remove an object from the queue's (if it's still there)
	 *  Abort the XHR if it's in progress
	 *  @param {Tone.Buffer} buffer the buffer to remove
	 *  @private
	 */
	Tone.Buffer._removeFromQueue = function(buffer){
		var i;
		for (i = 0; i < Tone.Buffer._queue.length; i++){
			var q = Tone.Buffer._queue[i];
			if (q.Buffer === buffer){
				Tone.Buffer._queue.splice(i, 1);
			}
		}
		for (i = 0; i < Tone.Buffer._currentDownloads.length; i++){
			var dl = Tone.Buffer._currentDownloads[i];
			if (dl.Buffer === buffer){
				Tone.Buffer._currentDownloads.splice(i, 1);
				dl.xhr.abort();
				dl.xhr.onprogress = null;
				dl.xhr.onload = null;
				dl.xhr.onerror = null;
			}
		}
	};

	/**
	 *  load the next buffer in the queue
	 *  @private
	 */
	Tone.Buffer._next = function(){
		if (Tone.Buffer._queue.length > 0){
			if (Tone.Buffer._currentDownloads.length < Tone.Buffer.MAX_SIMULTANEOUS_DOWNLOADS){
				var next = Tone.Buffer._queue.shift();
				Tone.Buffer._currentDownloads.push(next);
				next.xhr = Tone.Buffer.load(next.url, function(buffer){
					//remove this one from the queue
					var index = Tone.Buffer._currentDownloads.indexOf(next);
					Tone.Buffer._currentDownloads.splice(index, 1);
					next.Buffer.set(buffer);
					next.Buffer.onload(next.Buffer);
					Tone.Buffer._onprogress();
					Tone.Buffer._next();
				});
				next.xhr.onprogress = function(event){
					next.progress = event.loaded / event.total;
					Tone.Buffer._onprogress();
				};
				next.xhr.onerror = Tone.Buffer.onerror;
			} 
		} else if (Tone.Buffer._currentDownloads.length === 0){
			Tone.Buffer.onload();
			//reset the downloads
			Tone.Buffer._totalDownloads = 0;
		}
	};

	/**
	 *  internal progress event handler
	 *  @private
	 */
	Tone.Buffer._onprogress = function(){
		var curretDownloadsProgress = 0;
		var currentDLLen = Tone.Buffer._currentDownloads.length;
		var inprogress = 0;
		if (currentDLLen > 0){
			for (var i = 0; i < currentDLLen; i++){
				var dl = Tone.Buffer._currentDownloads[i];
				curretDownloadsProgress += dl.progress;
			}
			inprogress = curretDownloadsProgress;
		}
		var currentDownloadProgress = currentDLLen - inprogress;
		var completed = Tone.Buffer._totalDownloads - Tone.Buffer._queue.length - currentDownloadProgress;
		Tone.Buffer.onprogress(completed / Tone.Buffer._totalDownloads);
	};

	/**
	 *  makes an xhr reqest for the selected url
	 *  Load the audio file as an audio buffer.
	 *  Decodes the audio asynchronously and invokes
	 *  the callback once the audio buffer loads.
	 *  @param {string} url the url of the buffer to load.
	 *                      filetype support depends on the
	 *                      browser.
	 *  @param {function} callback function
	 *  @returns {XMLHttpRequest} returns the XHR
	 */
	Tone.Buffer.load = function(url, callback){
		var request = new XMLHttpRequest();
		request.open("GET", url, true);
		request.responseType = "arraybuffer";
		// decode asynchronously
		request.onload = function() {
			Tone.context.decodeAudioData(request.response, function(buff) {
				if(!buff){
					throw new Error("could not decode audio data:" + url);
				}
				callback(buff);
			});
		};
		//send the request
		request.send();
		return request;
	};

	/**
	 *  callback when all of the buffers in the queue have loaded
	 *  @static
	 *  @type {function}
	 */
	Tone.Buffer.onload = function(){};

	/**
	 *  callback with the progress of all of the loads in the queue
	 *  @static
	 *  @type {function}
	 */
	Tone.Buffer.onprogress = function(){};

	/**
	 *  callback if one of the buffers in the queue encounters an error
	 *  @static
	 *  @type {function}
	 */
	Tone.Buffer.onerror = function(){};

	return Tone.Buffer;
});