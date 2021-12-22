var delt = 50
var maxSteps = 5000 / delt
var currSteps = 0
var spacePressed = 0
var exps = []
var tr = 0.85
var queueSize = 60
var queueTrunc = 15
var queuePos = 0
var queue = []
var memesPackSize = 10

async function connectWebcam(){
	let stream = await navigator.mediaDevices.getUserMedia({ video: {}});
	let videoElement = $("#videoElement").get(0);
	videoElement.srcObject = stream;
	videoElement.play();
}

async function doPrediction(){
	let isLoaded = !!faceapi.nets.tinyFaceDetector.params;
	let videoElement = $("#videoElement").get(0);
	if(!isLoaded || videoElement.paused || videoElement.ended){
		console.log("Not Loaded!");
		return setTimeout(doPrediction);
	}

	let inputSize = 512;
	let threshold = 0.5;

	let netOptions = new faceapi.TinyFaceDetectorOptions({inputSize, threshold});
    console.log("before result");
	let result = await faceapi.detectSingleFace(videoElement, netOptions).withFaceExpressions();

	console.log("try predict");
	if(result)
		exps.push(result.expressions["happy"] >= tr);
	else
	    exps.push(0);
	setTimeout(doPrediction);
}

async function loadModels(){
	await faceapi.nets.tinyFaceDetector.load("/static/faceapi/model/tiny_face_detector_model-weights_manifest.json");
	await faceapi.nets.faceExpressionNet.load("/static/faceapi/model/face_expression_model-weights_manifest.json");
}

async function showMeme(){
    $("#meme").get(0).src = "/static/memes/" + queue[queuePos]["meme_id"] + ".jpg";
    if(queue[queuePos]["liked"] == 1)
        $("#like-button").attr("class", "red");
    else
        $("#like-button").attr("class", "gray");
    console.log("current meme is " + queue[queuePos]["meme_id"]);
}

async function setLikeMeme(){
    $.ajax({
            type: "POST",
            url: "/like_meme",
            dataType: "json",
            data: JSON.stringify({
                "meme_id": queue[queuePos]["meme_id"],
                "value": queue[queuePos]["liked"]
            })
    });
}

async function nextMeme(){
    setLikeMeme();
    currSteps = 0;
    exps = [];
    queuePos++;
    if(queue.length - queuePos <= memesPackSize){
        $.ajax({
            type: "POST",
            url: "/meme"
        }).done((msg) => {
            queue = queue.concat(msg);
            if(queue.length > queueSize){
                queuePos -= queueTrunc;
                if(queuePos < 0)
                    queuePos = 0;
                queue.splice(0, queueTrunc);
            }
        })
    }
    if(queuePos >= queue.length)
        queuePos = Math.max(0, queue.length - 1);
    showMeme();
}

async function likeMeme(setMeme){
    if(setMeme == 1)
        queue[queuePos]["liked"] = 1;
    else
        queue[queuePos]["liked"] = 1 - queue[queuePos]["liked"];
    showMeme();
}

async function prevMeme(){
    setLikeMeme();
    currSteps = 0;
    exps = [];
    queuePos--;
    if(queuePos < 0) queuePos = 0;
    showMeme();
}

document.addEventListener('keydown', (event) =>{
    if(event.code == "Space") spacePressed = 1;
});

document.addEventListener('keyup', (event) =>{
    if(event.code == "Space") spacePressed = 0;
});

async function memeScroller(){
    if(!spacePressed){
        currSteps++;
        if(exps.includes(true)){
            likeMeme(1);
            exps = [];
        }
        if(currSteps > maxSteps){
            currSteps = 0;
            exps = [];
            nextMeme();
        }
        $("#meme-line-progress").get(0).style.width = (currSteps * 100.0 / maxSteps).toString() + "%";
    }
    setTimeout(memeScroller, delt);
}

async function main(){
	let cam = connectWebcam();
	let models = loadModels();
	console.log("loading ...");
	await cam;
	await models;
	console.log("Loaded weights!");
	await $.ajax({
        type: "POST",
        url: "/meme"
    }).done((msg) => {
        queue = queue.concat(msg);
    })
	setTimeout(doPrediction, 1000);
	showMeme();
    memeScroller();
}

$(document).ready(function(){
    main();
    $("#left-button").click(prevMeme);
    $("#like-button").click(likeMeme);
    $("#right-button").click(nextMeme);
});