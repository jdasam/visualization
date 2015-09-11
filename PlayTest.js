var request = new XMLHttpRequest();
request.open('GET', url, true);
request.responseType = 'arraybuffer';

// Decode asynchronously
request.onload = function() {
  context.decodeAudioData(request.response, function(theBuffer) {
    buffer = theBuffer;
  }, onError);
}
request.send();