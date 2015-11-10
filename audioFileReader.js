var audioContext;
var sourceNode;
var startOffset = 0;
var startTime = 0;
var audioFile;
var playingOn=false;
var increaseValueSave;
var userRecord = [];
var volumes = []; // volume per every window samples

var fftSize = 4096;
var samplingRate = 44100;
var frequencyBinSize = samplingRate/fftSize;


var blackmanAlpha = 0.16
var blackman0 = (1-blackmanAlpha)/2
var blackman1 = 1/2
var blackman2 = blackmanAlpha/2

var smoothingTimeConstant = 0.1;



var dummyArray = new Array(fftSize/2);
for (var i=0; i<fftSize/2; i++){
    dummyArray[i] = 0;
}


var hot = new chroma.ColorScale({
    colors:['#000000', '#ff0000', '#ffff00', '#ffffff'],
    positions:[0, .25, .75, 1],
    mode:'rgb',
    limits:[0, 300]
});




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
	monoAudio = audioToMono(audioBuffer)

	//after the audio file decoded, call volume calculator first
	calculateVolume(volumes, monoAudio, 2048);
	
	//then generate volume graph with the volume array
	
	var graph = generateVolumeGraph(monoAudio, 1000);
	plotGraph(graph, document.getElementById("plottingCanvas"));
	//drawRoughness(roughnessArray, document.getElementById("plottingCanvas"));

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
	var valueArray = new Array(length);
	var alphaArray = new Array(length);
	var roughnessArray = new Array(length);
	var arrayLength = floatArray.length;
	var samplesPerX = arrayLength/length * 20; // overlapping samples
	var offsetPerX = arrayLength/length;

	var roughnessRaw = doFFT(floatArray);

	var fftWindowPerX = roughnessRaw.length / length ;
	if (Math.floor(fftWindowPerX) % 2 == 0) fftWindowPerX++

	for(var i = 0; i<length; i++){
		valueArray[i] = getAverageVolume(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
		alphaArray[i] = getOnsetDensity(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
		roughnessArray[i] = averageWindow(roughnessRaw, Math.floor(i * fftWindowPerX), Math.floor(fftWindowPerX) * 5);
		
	}

	return {value:valueArray, alpha:alphaArray, roughness:roughnessArray};
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
	}



	var sum = 0;

	var index = offset;
	while(index<offset+length){
	   
		var volumeIndex = Math.floor(index/1024) + 1;
		if(volumeIndex<0){ //first 1024 has no volume value;
		}else{
			sum+= 150*Math.log(volumes[volumeIndex]/(2*2048))/Math.LN10 + 250;
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
	var graphic_context = canvas.getContext("2d");
	


	graphic_context.globalAlpha = 1;
    graphic_context.fillStyle= "#ffffff";
    graphic_context.fillRect(0,0,canvas.width, canvas.height);

    for(var i = 0; i<graph.value.length; i++){
    	graphic_context.beginPath();
   		graphic_context.globalAlpha = graph.alpha[i] / audioFile.length * 400000 + 0.3;
    	graphic_context.moveTo(i,canvas.height);
		graphic_context.lineTo(i, -graph.value[i]);
		//console.log(graph.roughness[i]);
		var R = graph.roughness[i] * 1000
		//console.log(R)
		//if (isNaN(R)) console.log(i)

		R = Math.round(R);

		//graphic_context.strokeStyle= "rgb( "+R+", 0 ,0)"
		graphic_context.strokeStyle = hot.getColor(R).hex();
    	graphic_context.lineWidth=1;

    	graphic_context.stroke();    

    }


    /*
    for(var i = 0; i<graph.length; i++){
    	context.moveTo(i,canvas.height);
    	context.lineTo(i,-graph.value[i]);
    }
    */
     
   
}

function drawRoughness(array, canvas){
	var graphic_context = canvas.getContext("2d");

	graphic_context.globalAlpha = 1;

    for(var i = 0; i<array.length; i++){
    	graphic_context.beginPath();
    	graphic_context.moveTo(i,canvas.height);
		graphic_context.lineTo(i, canvas.height - array[i] * 1000);
		graphic_context.strokeStyle="#FF0000";
    	graphic_context.lineWidth=1;

    	graphic_context.stroke();    

    }

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



function doFFT(input){
    var result = {};
    var smoothingBuffer = dummyArray;
    var roughnessArray = [];

    for (var i=0, len = fftSize - input.length % fftSize; i<len; i++){
        input.push(0);
    }
    

    for (var i = 0, len = input.length; i<len; i = i+fftSize){
        var fft = new FFT(fftSize, 44100);
        var hop = input.slice(i, i+fftSize);
        hop = blackmanWindow(hop);
        fft.forward(hop);
        //fft.spectrum = smoothingFilters(fft.spectrum, 2);
        fft.spectrum = smoothing(fft.spectrum, smoothingBuffer);
        smoothingBuffer = fft.spectrum;
        var peakArray = peakDetection(fft.spectrum, 50);


        var totalRoughness = 0;
        for (var j = 0; j < 20; j++){
            for (var k = j+1; k < 20; k++){
                totalRoughness += roughnessCalculation(peakArray[j], peakArray[k]);
            }
        }

        roughnessArray.push(totalRoughness);
        //console.log(totalRoughness);
        //fft.spectrum = conversionToDB(fft.spectrum);
      
    }
    return roughnessArray;

}

function blackmanWindow(array){
    var output = new Array
    for (var i = 0, len = array.length; i<len; i++){
        output[i] = array[i] * (blackman0 - blackman1 * Math.cos(2 * Math.PI * i / len) + blackman2 * Math.cos(4 * Math.PI * i /len))
    }
    return output
}

function smoothing(currentArray, bufferArray){
    var output = new Array
    for (var i = 0, len = currentArray.length; i<len; i++){
        output[i] = smoothingTimeConstant * bufferArray[i] + (1 - smoothingTimeConstant) * currentArray[i]
    }
    return output
}

function conversionToDB(array){
    var output = new Array
    for (var i = 0, len = array.length; i<len; i++){
        output[i] = 50 * Math.log(array[i]) / Math.log(10) ;
    }
    //console.log(output)
    return output
}

function smoothingFilters(array, filterWidth){
    var output = new Array(array.length);

    for (var i = 0, len = array.length; i<len; i++){
        if (i > filterWidth && i +filterWidth < array.length){
            var sum = 0;
            for (var k = -filterWidth; k <= filterWidth; k++){
                sum += array[i+k];
            }

            output[i] = sum / (1 + 2 * filterWidth)                
        }
        else {
            output[i] = array[i]
        }

    }
    return output;
}

function peakDetection(array, peakNumber){
    var output = [];
    for (var i = 0, len = array.length; i<len; i++){
        if(array[i] > Math.max(array[i-3], array[i-2], array[i-1], array[i+1], array[i+2], array[i+3]))
            output.push([i, array[i]]);
    }

    if (output.length < peakNumber){
    	for (var j = 0, len=peakNumber - output.length; j <len; j++){
    		output.push([0,0]);
    	}
    }
    
    output.sort(function(a,b){
        if (a[1] > b[1]) return -1;
        if (a[1] < b[1]) return 1;
        return 0;})
    output = output.slice(0,peakNumber);


    return output
}

function roughnessCalculation (sineA, sineB){
    var ampMin = Math.min(sineA[1], sineB[1]);
    var ampMax = Math.max(sineA[1], sineB[1]);
    var freqMin = (Math.min(sineA[0], sineB[0]) +0.5) * frequencyBinSize;
    var freqMax = (Math.max(sineA[0], sineB[0]) +0.5) * frequencyBinSize;

    
    var X = ampMin * ampMax
    var Y = 2 * ampMin / (ampMin + ampMax)
    var Z = Math.exp(-3.5 * 0.24/(0.0207 * freqMax +18.96) * (freqMax - freqMin)) - Math.exp(-5.75 * 0.24/(0.0207 * freqMax +18.96) * (freqMax - freqMin)) 
    
    if (isNaN(Y)) return 0

    return Math.pow(X,0.1) * 0.5 * Math.pow(Y,3.11) * Z;



}


function audioToMono(input){
    var left = input.getChannelData(0);
    var right = input.getChannelData(1);
    var result = new Array(left.length);
    for (var i = 0, len = input.length; i<len; i++){
        result[i] = left[i]/2 + right[i]/2
    }
    return result;
}

function averageWindow(array, index, width){
	var sum=0;
	if (index > width && index + width < array.length){
		for(var i=0; i<width; i++){
			sum += array[index - (width-1)/2 + i];
		}
		return sum/width;
	}

	else return array[index];

}

