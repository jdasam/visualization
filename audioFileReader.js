var audioContext;
var sourceNode;
var startOffset = 0;
var startTime = 0;
var audioFile;
var playingOn=false;
var userRecord = [];



var contextClass = (window.AudioContext || 
  window.webkitAudioContext || 
  window.mozAudioContext || 
  window.oAudioContext || 
  window.msAudioContext);
if (contextClass) {
  // Web Audio API is available.
  var context = new contextClass();
} else {
  // Web Audio API is not available. Ask the user to use a supported browser.
  // Does this work?
  alert('The Web browser does not support WebAudio. Please use the latest version.');
}



window.onload=function(){

	var canvas = document.getElementById("interfaceCanvas");
	canvas.addEventListener("mousedown", doMouseDown, false);

	var control = document.getElementById("fileChooseInput");
	control.addEventListener("change", fileChanged, false);

	audioContext = new AudioContext();
}

window.requestAnimFrame = (function(callback) {
        return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
        function(callback) {
          window.setTimeout(callback, 1000 / 60);
        };
})();




//file loading

function fileChanged(e){
	var file = e.target.files[0];
	var fileReader = new FileReader();
	fileReader.onload = fileLoaded;
	fileReader.readAsArrayBuffer(file);
	startOffset = 0;
}

function fileLoaded(e){
	audioContext.decodeAudioData(e.target.result, audioFileDecoded, audioFileDecodeFailed);
}

function audioFileDecoded(audioBuffer){
	if (sourceNode) {
		stop();
	}
	audioFile = audioBuffer;
	var graph = generateVolumeGraph(audioBuffer.getChannelData(0), 1000);
	plotGraph(graph, document.getElementById("plottingCanvas"));
	playSound(audioBuffer);
	
	//전체적으로 drawProgress 호출이 중구난방이네요. 
	//애니메이션 구조를 좀 정리해야겠어요.
	drawProgress(document.getElementById("interfaceCanvas"));
}

function audioFileDecodeFailed(e){
	alert("The audio file cannot be decoded!");
}



function loadSound(url) {
	var request = new XMLHttpRequest();
	request.open('GET', url, true);
	request.responseType = 'arraybuffer';

	// When loaded decode the data
	request.onload = function() {

		// decode the data
		context.decodeAudioData(request.response, audioFileDecoded, audioFileDecodeFailed);
	}
	request.send();
}




function setupAudioNodes() {
	// create a buffer source node
	sourceNode = audioContext.createBufferSource();
	// and connect to destination
	sourceNode.connect(audioContext.destination);
	
}


//audio file playback control

function playSound(audioBuffer) {
	setupAudioNodes(); //이거 사실 한번만 호출해 두면 될 것 같은데...
	startTime = audioContext.currentTime;
	sourceNode.buffer = audioBuffer;
	sourceNode.start(0, startOffset % audioBuffer.duration);
	playingOn = true;
}

function pause() {
	sourceNode.stop();
	// Measure how much time passed since the last pause.
	startOffset += audioContext.currentTime - startTime;
	playingOn = false;
}

function stop() {
	sourceNode.stop();
	startOffset = 0;
	playingOn = false;
}




function doMouseDown(e){
	//var currentTime = remainingSeconds;
	var rect = e.target.getBoundingClientRect();
	var x= e.clientX-rect.left - e.target.clientLeft + e.target.scrollLeft;

	canvas_x = x/1000 * audioFile.length / audioFile.sampleRate;
	stop();
	startOffset = canvas_x;
	playSound(audioFile);
	userRecord.push([currentTime, canvas_x.toFixed(2)]);
	
}





function generateVolumeGraph(floatArray, length){
	var graph = [];
	var arrayLength = floatArray.length;
	var overlappingSamples = arrayLength/length * 25;
	var offsetPerX = (arrayLength)/length;
	var samplesPerX = overlappingSamples;

	for(var i = 0; i<length; i++){
		graph[i] = getAverageVolume(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
	}
	return graph;
}

function getAverageVolume(floatArray, offset, length){
	
	if(offset < 0){
		offset=0;
	}

	
	if(offset+length>floatArray.length){
		//length = Math.min(floatArray.length - offset, 1);
		console.log("warning: getAverageVolume() received wrong range:" + floatArray + offset + length);
		return -600;
	}


	var squareSum = 0;

	var sampleCount = 0;
	var microSum = 0;
	var onsetCount = 0;
	var windowPrevious;
	var windowCurrent;
	var windowNext;
	var onsetDetect = false;


	for(var i = 0; i<length; i++){
		if (sampleCount == 1024) {
			sampleCount = 0;
			if (windowCurrent > windowPrevious)
			
			windowPrevious = windowCurrent;
		}
		
		squareSum += floatArray[offset]*floatArray[offset++];
		sampleCount++;
	}
	return 180*Math.log(squareSum/length)/Math.LN10 + 220;
}

function plotGraph(graph, canvas){
	var context = canvas.getContext("2d");
	
    context.fillStyle= "#f0f0f0";
    context.fillRect(0,0,canvas.width, canvas.height);
    context.beginPath();
    for(var i = 0; i<graph.length; i++){
    	context.moveTo(i,canvas.height);
    	context.lineTo(i,-graph[i]);
    }
     
    
    context.strokeStyle="#000000";
    context.lineWidth=1;
    context.stroke();    
    
}


function drawProgress(canvas){
	var progress = canvas.getContext("2d");
	
	progress.clearRect(0, 0, canvas.width, canvas.height);
	
	progress.fillStyle = "darkorange"
	progress.beginPath();
	progress.moveTo(startOffset * 1000 /audioFile.length * audioFile.sampleRate, 0);
    progress.lineTo(startOffset * 1000 /audioFile.length * audioFile.sampleRate, canvas.height);
    progress.lineWidth=1;
    progress.stroke();    
    
    if (playingOn){
    	startOffset += audioContext.currentTime - startTime;
    	startTime = audioContext.currentTime;
    }
    
    
    
	requestAnimFrame(function() {
		drawProgress(document.getElementById("interfaceCanvas"))
	});
}

