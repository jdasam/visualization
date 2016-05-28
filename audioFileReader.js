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

var volumeWindowSize = 2048;
var graph;

var blackmanAlpha = 0.16
var blackman0 = (1-blackmanAlpha)/2
var blackman1 = 1/2
var blackman2 = blackmanAlpha/2

var smoothingTimeConstant = 0.1;

var color1 = [0,1,1]
var color2 = [180,1,1]
var color3 = [0,1,1]
var color4 = [30,1,1]


var roughnessScaled;
var volumeScaled;
var onsetScaled;


var dummyArray = new Array(fftSize/2);
for (var i=0; i<fftSize/2; i++){
    dummyArray[i] = 0;
}





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
	var monoAudio = audioToMono(audioBuffer)

	//after the audio file decoded, call volume calculator first
	//(output array, input array, windowSize)
	// this function save the result into output array
	calculateVolume(volumes, monoAudio, volumeWindowSize);
	
	//then generate volume graph with the volume array
	
	graph = generateVolumeGraph(monoAudio, plottingCanvasWidth);
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

	canvas_x = x/plottingCanvasWidth * audioFile.length / audioFile.sampleRate;
	//player.seekTo(canvas_x, true);
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
	var onsetArray = new Array(length);
	var roughnessArray = new Array(length);
	var arrayLength = floatArray.length;
	var samplesPerX = Math.floor(arrayLength/length * 20); // overlapping samples
	var offsetPerX = arrayLength/length;
	
	//var roughnessRaw = [];

	/*
	//do fft by dividing entire song in one minute
	for(var i = 0; i< floatArray.length ; i += 2646000){
		var slicedArray = floatArray.slice(i,i+2646000)
	}
	*/

	var roughnessRaw = doFFTforFloatArray(floatArray);
	var fftWindowPerX = roughnessRaw.length / length ;
	//if (Math.floor(fftWindowPerX) % 2 == 0) fftWindowPerX++
	var roughnessPerX = Math.floor(fftWindowPerX * 5)
	if (roughnessPerX % 2 == 0) roughnessPerX++


	for(var i = 0; i<length; i++){
		valueArray[i] = getAverageVolume(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
		onsetArray[i] = getOnsetDensity(floatArray, Math.floor((offsetPerX*i)-samplesPerX/2), samplesPerX);
		roughnessArray[i] = averageWindow(roughnessRaw, Math.floor(i * fftWindowPerX), roughnessPerX);
		
	}

	roughnessScaled = scalingRoughness(roughnessArray);
    volumeScaled = scalingVolume(valueArray);
    onsetScaled = scalingRoughness(onsetArray);



	return {value:valueArray, onset:onsetArray, roughness:roughnessArray};
}


function getAverageVolume(floatArray, offset, length){
	

	// 처음 시작부분 offset이 0보다 작을 때 
	if (offset < 0){
		length = length + offset;
		offset = 0; 
	}

	// 끝 부분 offset
	if(offset+length>floatArray.length){
		//length = Math.floor(2*(floatArray.length - (offset + length/2)))
		//offset = floatArray.length - length;


		offset = offset + (offset - (floatArray.length - length) ) 
		length = floatArray.length - offset

	}


	var sum = 0.00000000001; // in case total sum is zero

	var index = offset;
	while(index<offset+length){
	   
		var volumeIndex = Math.floor(index/(volumeWindowSize/2)) - 2;
		if (volumeIndex > volumes.length) console.log(volumeIndex);
		if(volumeIndex<0){ //first 1024 has no volume value;
		}else{
			sum+= volumes[volumeIndex];
		}
		index+=volumeWindowSize/2;
	}



	return Math.log(sum / ( length / (volumeWindowSize/2) ))/Math.LN10;
}

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
		var volumeIndex = Math.floor(index/(volumeWindowSize/2))-1;
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


	index += volumeWindowSize;
	}
	increaseValueSave = increaseValue;
	return onsetCount;

}

function colorChanged(e){
	if(e.target==document.getElementById("color1")){
		var r = parseInt(e.target.value.slice(1,3),16);
		var g = parseInt(e.target.value.slice(3,5),16);
		var b = parseInt(e.target.value.slice(5,7),16);
		color1 = rgb2hsv(r,g,b);
	}else if(e.target==document.getElementById("color2")){
		var r = parseInt(e.target.value.slice(1,3),16);
		var g = parseInt(e.target.value.slice(3,5),16);
		var b = parseInt(e.target.value.slice(5,7),16);
		color2 = rgb2hsv(r,g,b);
	}else if(e.target==document.getElementById("color3")){
		var r = parseInt(e.target.value.slice(1,3),16);
		var g = parseInt(e.target.value.slice(3,5),16);
		var b = parseInt(e.target.value.slice(5,7),16);
		color3 = rgb2hsv(r,g,b);
	}else if(e.target==document.getElementById("color4")){
		var r = parseInt(e.target.value.slice(1,3),16);
		var g = parseInt(e.target.value.slice(3,5),16);
		var b = parseInt(e.target.value.slice(5,7),16);
		color4 = rgb2hsv(r,g,b);
	}else if(e.target==document.getElementById("color5")){
	}

	plotGraph(graph, document.getElementById("plottingCanvas"));
}

function plotGraph(graph, canvas){
	var graphic_context = canvas.getContext("2d");
	

	graphic_context.globalAlpha = 1;
    graphic_context.fillStyle= "#000";
    graphic_context.fillRect(0,0,canvas.width, canvas.height);


    for(var i = 0; i<graph.value.length; i++){

		var S = onsetScaled[i]/100

		//console.log(R);
		//var L = Math.round(R/2);
    	//graphic_context.setLineDash([5, Math.floor( 1/density)])

    	if ( color1[0] > color2[0] && color1[0] - color2[0] <= 180) {
    		var rgb = hsv_to_rgb((color2[0] + (color1[0]-color2[0]) * S)%360, (color2[1] + (color1[1]-color2[1])*S) , (color2[2]+ (color1[2]-color2[2])*S) )
    	}else if(color1[0] > color2[0] && color1[0] - color2[0] > 180 ) {
    		var rgb = hsv_to_rgb((color2[0] +360 - (color2[0] +360 - color1[0]) * S)%360, (color2[1] + (color1[1]-color2[1])*S) , (color2[2]+ (color1[2]-color2[2])*S) )
    	}else if( color1[0] < color2[0] && color2[0] - color1[0] < 180 ) {
    		var rgb = hsv_to_rgb((color2[0] + (color1[0]-color2[0]) * S)%360, (color2[1] + (color1[1]-color2[1])*S) , (color2[2]+ (color1[2]-color2[2])*S) )
    	}else if( color1[0] < color2[0] && color2[0] - color1[0] >= 180 ) {
    		var rgb = hsv_to_rgb((color2[0] + (color1[0] +360 - color2[0]) * S)%360, (color2[1] + (color1[1]-color2[1])*S) , (color2[2]+ (color1[2]-color2[2])*S) )
    	}




    	rgb[0] = Math.round(rgb[0]);
    	rgb[1] = Math.round(rgb[1]);
    	rgb[2] = Math.round(rgb[2]);


    	graphic_context.beginPath();
    	graphic_context.moveTo(i+0.5,canvas.height);
    	graphic_context.lineTo(i+0.5, -volumeScaled[i]);
    	graphic_context.strokeStyle = "rgba("+rgb[0]+", "+rgb[1]+" , "+rgb[2]+", 1)"
    	//graphic_context.strokeStyle = "rgba(" + R + ", "+Y+" , 20, 1)"
    	graphic_context.stroke();    
   		//graphic_context.globalAlpha = graph.alpha[i] / audioFile.length * 400000 + 0.3;
		//graphic_context.strokeStyle = hot.getColor(roughnessScaled[i]).hex();

		

		//var B = Math.round(roughnessScaled[i] / 100 * 255 * 1.4)
		S= roughnessScaled[i] / 100;
    	rgb = hsv_to_rgb((color4[0] + (color3[0]-color4[0]) * S)%360, (color4[1] + (color3[1]-color4[1])*S) , (color4[2]+ (color3[2]-color4[2])*S) )
    	rgb[0] = Math.round(rgb[0]);
    	rgb[1] = Math.round(rgb[1]);
    	rgb[2] = Math.round(rgb[2]);


    	graphic_context.beginPath();
    	graphic_context.strokeStyle = "rgba("+rgb[0]+", "+rgb[1]+" , "+rgb[2]+", 1)"
		//graphic_context.strokeStyle = "rgba("+(280 - B)+", "+(280 - B)+", 255, 1)"
		//graphic_context.strokeStyle = "rgba("+B+", "+B+", "+B+", 1)"
    	graphic_context.moveTo(i+0.5, 0);
		graphic_context.lineTo(i+0.5, -volumeScaled[i]-1);
		graphic_context.stroke();



    }
    graphic_context.beginPath();
 	graphic_context.strokeStyle = document.getElementById("color5").value;
 	graphic_context.lineWidth = 3;
 	graphic_context.lineJoin = 'round';
    graphic_context.moveTo(0,canvas.height-volumeScaled[0]);
    for (var i = 0;i<volumeScaled.length; i++){
    	graphic_context.lineTo(i,-volumeScaled[i]);
    }
    graphic_context.stroke();

    /*
    
    for(var i = 0; i<graph.value.length; i++){
		var B = Math.round(graph.alpha[i] / audioFile.length * 100000000);

    	graphic_context.beginPath();
		graphic_context.strokeStyle = "rgba(255, 255, 255, 1)"
    	graphic_context.moveTo(i, 0);
		graphic_context.lineTo(i, -volumeScaled[i] - 10);
      	graphic_context.strokeStyle = "rgb (0 , 0 , "+B+")"
		graphic_context.stroke();
    }



    /*
    for(var i = 0; i<graph.length; i++){
    	context.moveTo(i,canvas.height);
    	context.lineTo(i,-graph.value[i]);
    }
    */
     
   
}

/*

function drawRoughness(array, canvas){
	var graphic_context = canvas.getContext("2d");

	graphic_context.globalAlpha = 1;

    for(var i = 0; i<array.length; i++){
    	graphic_context.beginPath();
    	graphic_context.moveTo(i,canvas.height);
		graphic_context.lineTo(i, canvas.height - array[i] * plottingCanvasWidth);
		graphic_context.strokeStyle="#FF0000";
    	graphic_context.lineWidth=1;

    	graphic_context.stroke();    

    }

}
*/

function drawProgress(canvas){
	var progress = canvas.getContext("2d");
	
	progress.clearRect(0, 0, canvas.width, canvas.height);
	progress.strokeStyle = "#ffffff"

	progress.beginPath();
	progress.moveTo(startOffset * plottingCanvasWidth /audioFile.length * audioFile.sampleRate, 0);
    progress.lineTo(startOffset * plottingCanvasWidth /audioFile.length * audioFile.sampleRate, canvas.height);
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



function doFFTforFloatArray(input){
    var result = {};
    var smoothingBuffer = dummyArray;
    var roughnessArray = [];

    // push 대신 바꾸기 
    

    for (var i = 0, len = input.length; i<(len - (len%fftSize)); i = i+fftSize){
        var fft = new FFT(fftSize, 44100);
        // slice -> blackman window index로 수
        var hop = blackmanWindowIndex(input, i, fftSize);
        fft.forward(hop);
        fft.spectrum = smoothing(fft.spectrum, smoothingBuffer);
        smoothingBuffer = fft.spectrum;
        var peakArray = peakDetection(fft.spectrum, 50);


        var totalRoughness = 0;
        for (var j = 0; j < 50; j++){
            for (var k = j+1; k < 50; k++){
                totalRoughness += roughnessCalculation(peakArray[j], peakArray[k]);
            }
        }

        var spectrumSum = 0;
        for (var j=0, fftlen=fft.spectrum.length; j<fftlen; j++){
        	spectrumSum += fft.spectrum[j];
        }

        spectrumSum += 0.8;
      
        totalRoughness = totalRoughness/spectrumSum * fft.spectrum.length;

        roughnessArray.push(totalRoughness);
        //console.log(totalRoughness);
        //fft.spectrum = conversionToDB(fft.spectrum);

      
    }
    return roughnessArray;
}


function blackmanWindowIndex(array, index, windowSize){
    var output = new Float32Array(windowSize)
    for (var i = 0; i<windowSize; i++){
        output[i] = array[index+i] * (blackman0 - blackman1 * Math.cos(2 * Math.PI * i / windowSize) + blackman2 * Math.cos(4 * Math.PI * i /windowSize))
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
    var result = new Float32Array(left.length);
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

function scalingRoughness(array){
	var minValue = 0;
	var maxValue = 0;

	for (var i = 0, len = array.length; i<len; i++){
		if (array[i] < minValue) minValue = array[i];
		if (array[i] > maxValue) maxValue = array[i];
	}

	var localSum = 0;
	var newArray = [];
	newArray.push(0);
	newArray.push(0);

	for(var i = 0; i<5; i++){
		localSum += array[i];
	}
	newArray.push(localSum/5);
	for(var i = 5; i<array.length; i++){
		localSum +=	array[i];
		localSum-= array[i-5];
		newArray.push(localSum/5);
	}
	newArray.push(0);
	newArray.push(0);
	array = newArray;
    //console.log(minValue);
    //console.log(maxValue);


	var output = new Float32Array(array.length);
        for (var i = 0, len = array.length; i<len; i++){
            output[i] = array[i] * 100/(maxValue - minValue);
        }
    return output
}

function scalingVolume(array){
	var minValue = -2; // fixed
	var maxValue = -1; // temporary value


	// find maxvalue of array. minValue is fixed. 	
	for (var i = 0, len = array.length; i<len; i++){
		if (array[i] < minValue) array[i] = minValue;
		if (array[i] > maxValue) maxValue = array[i];
	}
	

    //console.log(minValue);
    //console.log(maxValue);

	var output = new Float32Array(array.length);
        for (var i = 0, len = array.length; i<len; i++){
            output[i] = (array[i] - maxValue) * plottingCanvasHeight/(maxValue - minValue) - plottingCanvasHeight * 0.05;
        }
    return output

}


function hsv_to_rgb(h, s, v) {  
    var c = v * s;  
    var h1 = h / 60;  
    var x = c * (1 - Math.abs((h1 % 2) - 1));  
    var m = v - c;  
    var rgb;  
      
    if (typeof h == 'undefined') rgb = [0, 0, 0];  
    else if (h1 < 1) rgb = [c, x, 0];  
    else if (h1 < 2) rgb = [x, c, 0];  
    else if (h1 < 3) rgb = [0, c, x];  
    else if (h1 < 4) rgb = [0, x, c];  
    else if (h1 < 5) rgb = [x, 0, c];  
    else if (h1 <= 6) rgb = [c, 0, x];  
      
    return [255 * (rgb[0] + m), 255 * (rgb[1] + m), 255 * (rgb[2] + m)];  
  }   

function rgb2hsv (r,g,b) {
	var computedH = 0;
	var computedS = 0;
	var computedV = 0; 

	r=r/255; g=g/255; b=b/255;
	var minRGB = Math.min(r,Math.min(g,b));
	var maxRGB = Math.max(r,Math.max(g,b));

	// Black-gray-white
	if (minRGB==maxRGB) {
	computedV = minRGB;
	return [0,0,computedV];
	}

	// Colors other than black-gray-white:
	var d = (r==minRGB) ? g-b : ((b==minRGB) ? r-g : b-r);
	var h = (r==minRGB) ? 3 : ((b==minRGB) ? 1 : 5);
	computedH = 60*(h - d/(maxRGB - minRGB));
	computedS = (maxRGB - minRGB)/maxRGB;
	computedV = maxRGB;
	return [computedH,computedS,computedV];
}


/*
function blackmanWindow(array){
    var output = new Array
    for (var i = 0, len = array.length; i<len; i++){
        output[i] = array[i] * (blackman0 - blackman1 * Math.cos(2 * Math.PI * i / len) + blackman2 * Math.cos(4 * Math.PI * i /len))
    }
    return output
}



function doFFT(input){
    var result = {};
    var smoothingBuffer = dummyArray;
    var roughnessArray = [];

    // push 대신 바꾸기 
    for (var i=0, len = fftSize - input.length % fftSize; i<len; i++){
        input.push(0);
    }
    

    for (var i = 0, len = input.length; i<len; i = i+fftSize){
        var fft = new FFT(fftSize, 44100);
        // slice -> blackman window index로 수
        var hop = input.slice(i, i+fftSize);
        hop = blackmanWindow(hop);
        fft.forward(hop);
        //fft.spectrum = smoothingFilters(fft.spectrum, 2);
        fft.spectrum = smoothing(fft.spectrum, smoothingBuffer);
        smoothingBuffer = fft.spectrum;
        var peakArray = peakDetection(fft.spectrum, 50);


        var totalRoughness = 0;
        for (var j = 0; j < 50; j++){
            for (var k = j+1; k < 50; k++){
                totalRoughness += roughnessCalculation(peakArray[j], peakArray[k]);
            }
        }

        roughnessArray.push(totalRoughness);
        //console.log(totalRoughness);
        //fft.spectrum = conversionToDB(fft.spectrum);

      
    }
    return roughnessArray;
}
*/
