var audioContext;
var sourceNode;
var startOffset = 0;
var startTime = 0;
var audioFile;
var playingOn=false;
var increaseValueSave;
var userRecord = [];
var volumes = []; // volume per every window samples




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

	//after the audio file decoded, call volume calculator first
	calculateVolume(volumes, audioBuffer.getChannelData(0), 2048);

	//then generate volume graph with the volume array
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
	//재생 위치 기록
	//userRecord.push([currentTime, canvas_x.toFixed(2)]);
}


//calculate volume using simple linear array

function calculateVolume(volumeArray, sampleArray, windowSize){
	if(sampleArray.length<windowSize*3){
		console.log("error: sample length is too short. (less than 3*windowSize)");
		return;
	}

	var volumeIndex = 0;
	var lastIndex = Math.floor((sampleArray.length)/windowSize*2)-1;

	for(;volumeIndex<lastIndex; volumeIndex++){
		//calculate volume
		var index = volumeIndex*windowSize/2;
		var squareSum = 0;
		if (volumeIndex >= 0 && volumeIndex != lastIndex){
			
			for(var i = 0; i<windowSize; i++){
				//squareSum+= Math.pow(sampleArray[index] ,2 )

				squareSum+= Math.pow(sampleArray[index] * 0.5 *  (1- Math.cos(2*Math.PI*i/(windowSize))),2 )
				index++;

			}

			/*
			for(var i = 0; i<windowSize; i++){
				squareSum+=Math.pow((i/windowSize)*sampleArray[index-2048],2);
				index++;
			}
			for(var i = 0; i<windowSize; i++){
				squareSum+=Math.pow(sampleArray[index],2);
				index++;
			}
			for(var i = 0; i<windowSize; i++){
				squareSum+=Math.pow((1-i/windowSize)*sampleArray[index+2048],2);
				index++;

			}
			*/
		}
		volumeArray[volumeIndex] = squareSum + 0.00001; //prevent from become zero (which causes minus infinity)
		//volumeArray[volumeIndex] =  130*Math.log(squareSum/(2*windowSize))/Math.LN10 + 280;;

	}
}

function generateVolumeGraph(floatArray, length){
	var valueArray = [];
	var alphaArray = [];
	var arrayLength = floatArray.length;
	var samplesPerX = arrayLength/length * 20; // overlapping samples
	var offsetPerX = arrayLength/length;

	for(var i = 0; i<length; i++){
		valueArray[i] = getAverageVolume(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
		alphaArray[i] = getOnsetDensity(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);

	}
	return {value:valueArray, alpha:alphaArray};
}

function getAverageVolume(floatArray, offset, length){
	
	// 처음 시작부분 offset이 0보다 작을 때 
	if (offset < 0){
		//console.log(offset)
		length = length + offset*2;
		offset = 0; 



	}

	// 끝 부분 offset
	if(offset+length>floatArray.length){
		length = Math.floor(2*(floatArray.length - (offset + length/2)))
		offset = floatArray.length - length;
		console.log(floatArray.length);
		console.log(offset+length);
		//console.log(volumes[Math.floor(offset/1024)]);
		//console.log("warning: getAverageVolume() received wrong range:" + floatArray + offset + length);
		//return -600;
	}



	var sum = 0;

	var index = offset;
	while(index<offset+length){
	   
		var volumeIndex = Math.floor(index/1024) + 1;
		if(volumeIndex<0){ //first 1024 has no volume value;
		}else{
			sum+= 130*Math.log(volumes[volumeIndex]/(2*2048))/Math.LN10 + 280;
		}
		index+=1024;
	}

	return sum*1024/length;


	/*
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
	*/
}


//getAverageVolume(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
function getOnsetDensity(floatArray, offset, length){
	if(offset < 0){
		offset=0;
	}

	if(offset+length>floatArray.length){
		//length = Math.min(floatArray.length - offset, 1);

		//console.log("warning: getAverageVolume() received wrong range:" + floatArray + offset + length);
		return 0.5;
	}



	var onsetCount = 0;
	var index = offset;
	var increaseValue = 0;
	

	var onsetThreshold = 0.5;


	while(index<offset+length){
		var volumeIndex = Math.floor(index/1024)-1;
		if(volumes[volumeIndex+1] > volumes[volumeIndex]){
			increaseValue += volumes[volumeIndex+1] - volumes[volumeIndex];
		}
		else if(volumes[volumeIndex+1] <= volumes[volumeIndex] && increaseValue > onsetThreshold*volumes[volumeIndex+1] + 0.01){
			increaseValue = 0;
			onsetCount++;
		}
		else{
			increaseValue = 0;
		}


	index += 2048;
	}
	increaseValueSave = increaseValue;
	return onsetCount;

}


function plotGraph(graph, canvas){
	var context = canvas.getContext("2d");
	
	// !!!! context.setAlpha 오류 !!!!!!

	//context.setAlpha(1)
    context.fillStyle= "#ffffff";
    context.fillRect(0,0,canvas.width, canvas.height);

    for(var i = 0; i<graph.value.length; i++){
    	context.beginPath();
   		//context.setAlpha(graph.alpha[i] / audioFile.length * 400000 + 0.3);
    	context.moveTo(i,canvas.height);
		context.lineTo(i, -graph.value[i]);
		    context.strokeStyle="#000000";
    	context.lineWidth=1;

    	context.stroke();    

    }


    /*
    for(var i = 0; i<graph.length; i++){
    	context.moveTo(i,canvas.height);
    	context.lineTo(i,-graph.value[i]);
    }
    */
     
   
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