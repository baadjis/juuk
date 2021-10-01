import './style.css';

//import { firestore } from 'firebase/app';

import { initializeApp, getApps } from "firebase/app";
import { collection, doc, updateDoc, getDoc, getDocs, getFirestore, addDoc, setDoc, onSnapshot, Query } from 'firebase/firestore'

//import { getAnalytics } from "firebase/analytics";

//import WebSocket from 'ws';


// load firebase config

const conf = await fetch('./firebaseConfig.json')
const firebaseConfig = await conf.json()


// Initialize Firebase
//const apps = getApps()
const app = initializeApp(firebaseConfig)

const Firestore = getFirestore(app);

let AddedPeers = []

//const calls = collection(Firestore, 'calls')


//const callDoc = doc(calls);


// webrtc server
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10
};
const WS_PORT = 8443;

// Global State

let localStream;
let localuuid;
let localusername;

var peerConnections = {};

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');

const hangupButton = document.getElementById('hangupButton');
const usernameInput = document.getElementById("username-input")


let uuid;

// 1. Setup media sources

webcamButton.onclick = async () => {

  var constraints = {
    video: true,
    audio: false,
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
 
  webcamVideo.srcObject = localStream;



  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  //useWebsocket()


};


//to do in case we will use websocket 

/*
function useWebsocket() {

  let serverConnection = new WebSocket('ws://' + location.hostname + ':' + WS_PORT);

  serverConnection.onmessage = onMessage;
  serverConnection.onopen = event => {
    serverConnection.send(JSON.stringify({ username: localusername, uuid: localuuid }));
  }
  serverConnection.onerror = (event) => {
    console.log(event)

  }
}

async function onMessage(message) {
  console.log(message.data)
  var data_text = await message.data.text()
  var signal = JSON.parse(data_text);
  console.log(signal)
  if (signal.uuid == localuuid) return;
  else {
    uuid = signal.uuid;
    username = signal.username
    console.log(uuid)
  }



}*/



callButton.addEventListener('click', async (event) => {


  localuuid = createUUID()
  localusername = usernameInput.value;
  const col = collection(Firestore, 'calls')
  var callDoc = doc(col)
  callInput.value = callDoc.id;
  joinCall(callDoc, localuuid, localusername, true)
 


  hangupButton.disabled = false;
  answerButton.disabled = true
  hangupButton.addEventListener('click', (event) => hangUp(event, callDoc))
  onSnapshot(callDoc, (snapshot) => handleDocChange(snapshot, callDoc), (error) => errorHandler(error))
});

// 3. Answer the call with the unique ID
answerButton.addEventListener('click', async (event) => {


  localuuid = createUUID()
  localusername = usernameInput.value;
  const callId = callInput.value;
  const col = collection(Firestore, 'calls')
  var callDoc = doc(col, callId);
  joinCall(callDoc, localuuid, localusername)
  hangupButton.disabled = false;
  answerButton.disabled = true
  hangupButton.addEventListener('click', (event) => hangUp(event, callDoc))

  onSnapshot(callDoc, (snapshot) => handleDocChange(snapshot, callDoc), (error) => errorHandler(error))
  
 
 


});

async function hangUp(event, callDoc) {
  
  webcamVideo.srcObject.getTracks().forEach(track => track.stop())
  webcamVideo.srcObject = null
  for (let el of Object.keys(peerConnections)) {
    peerConnections[el].pc.close()
    document.getElementById('videos').removeChild(document.getElementById('remoteVideo_' + el));
  }
  let signal = {
    quit: 'quit',
    uuid: localuuid
  }
  await updateDoc(callDoc, { signal })
  
  webcamButton.disabled = false
  hangupButton.disabled = true
}

async function joinCall(callDoc, uuid, username, initial = false) {


  let signal = {
    username: username,
    uuid: uuid,
    destination: 'all'
  }
  if (initial) {
    await setDoc(callDoc, { signal })
    console.log("set doc")
  } else {
    await updateDoc(callDoc, { signal })
    console.log('updateDoc')
  }


  
}
function errorHandler(error) {
  console.log(error);
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleDocChange(snapshot, callDoc) {
  const data = snapshot.data();

  if (data.signal) {
    let datasignal = data.signal
    let uuid = datasignal.uuid
    console.log(datasignal)

    if (uuid == localuuid || (datasignal.destination != localuuid && datasignal.destination != 'all')) return;

    if (datasignal.username && datasignal.destination == 'all') {

      setUpPeer(uuid, datasignal.username, callDoc);

     
      let signal = {
        uuid: localuuid,
        username: localusername,
        destination: uuid
      }
      
      //await timeout(3000)
      updateDoc(callDoc, { signal }).then(() => console.log("updated newcommer snapshot"))


    } else if (datasignal.username && datasignal.destination == localuuid) {
      // initiate call if we are the newcomer peer
      
      setUpPeer(uuid, datasignal.username, callDoc, true);
      console.log("we are new comer")
    } else if (datasignal.sdp) {
      console.log('sdp', datasignal.sdp)
      console.log(datasignal.type)
      let desc = new RTCSessionDescription(datasignal)
      if (desc) {
        peerConnections[uuid].pc.setRemoteDescription(desc).then(function () {
          // Only create answers in response to offers
          console.log("setremote")
          if (datasignal.type == 'offer') {
            console.log("offer")
            peerConnections[uuid].pc.createAnswer().then(description => createdDescription(description, uuid, callDoc)).catch(errorHandler);
          }
        }).catch(errorHandler);
      } else {
        console.log("no desc")
      }
    } else if (datasignal.ice) {
          
      
          var signalice = JSON.parse(datasignal.ice)
    
          console.log(signalice)
    
          var candidate = new RTCIceCandidate(signalice);
    
         
            console.log(peerConnections[uuid].pc.iceConnectionState)
            if (candidate && peerConnections[uuid].pc) {
              console.log("peer",peerConnections[uuid].pc)
              peerConnections[uuid].pc.addIceCandidate(candidate).then(() => { console.log("added ice") })
            } else{
              console.log("no ice")
            }
          


    } else if (datasignal.quit) {
      console.log("quitted")
      await peerConnections[uuid].pc.createDataChannel("close")
      await peerConnections[uuid].pc.close()
    }

  } else {
    console.log("no signal")
    return;
  }

}

async function createdDescription(description, peerUuid, callDoc) {
  
  console.log(`got description, peer ${peerUuid}`);
  peerConnections[peerUuid].pc.setLocalDescription(description).then(async function () {

    await timeout(4000)
    console.log(peerConnections[peerUuid].pc.localDescription)
    let signal = {
      uuid: localuuid,
      destination: peerUuid,
      type: peerConnections[peerUuid].pc.localDescription.type,
      sdp: peerConnections[peerUuid].pc.localDescription.sdp

    }
    
    updateDoc(callDoc, { signal }).then(() => console.log("created description"))
  }).catch(errorHandler);

}

////////////////////////////////multiple videos//////////////////////


function gotRemoteStream(event, peerUuid, username) {
  if (event.streams) {
    
    if (!AddedPeers.includes(peerUuid)) {
      console.log(`got remote stream, peer ${peerUuid}`);

      var vidElement = document.createElement('video');
      vidElement.setAttribute('autoplay', '');
      vidElement.setAttribute('muted', '');
      

      vidElement.srcObject = event.streams[0];
      var vidContainer = document.createElement('div');
      vidContainer.setAttribute('id', 'remoteVideo_' + peerUuid);
      vidContainer.setAttribute('class', 'videoContainer');
      vidContainer.appendChild(vidElement);
      vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

      document.getElementById('videos').appendChild(vidContainer);

      updateLayout();

      AddedPeers.push(peerUuid)
      
    }
  }
}


function updateLayout() {
  // update CSS grid based on number of diplayed videos
  var rowHeight = '98vh';
  var colWidth = '98vw';

  var numVideos = Object.keys(peerConnections).length + 1; // add one to include local video
  
  if (numVideos > 1 && numVideos <= 4) { // 2x2 grid
    rowHeight = '48vh';
    colWidth = '48vw';
  } else if (numVideos > 4) { // 3x3 grid
    rowHeight = '32vh';
    colWidth = '32vw';
  }

  document.documentElement.style.setProperty(`--rowHeight`, rowHeight);
  document.documentElement.style.setProperty(`--colWidth`, colWidth);
}

function makeLabel(label) {
  var vidLabel = document.createElement('div');
  vidLabel.appendChild(document.createTextNode(label));
  vidLabel.setAttribute('class', 'videoLabel');
  return vidLabel;
}



async function setUpPeer(peerUuid, username, callDoc, initCall = false) {
   
  
  let pc = new RTCPeerConnection(servers) 
  
  if (pc!=null){
    console.log("setingup")
    peerConnections[peerUuid] = { 'displayName': username, 'pc':pc };

    peerConnections[peerUuid].pc.ontrack = event => gotRemoteStream(event, peerUuid, username);
      
    peerConnections[peerUuid].pc.onicecandidate = event => gotIceCandidate(event, peerUuid, callDoc);
    peerConnections[peerUuid].pc.oniceconnectionstatechange = event => checkPeerDisconnect(event, peerUuid);
    peerConnections[peerUuid].pc.addStream(localStream);
    peerConnections[peerUuid].pc.onclose = event => stop(event, peerUuid);
    
    
    if (initCall) {
      
      peerConnections[peerUuid].pc.createOffer().then(description =>{
        
        createdDescription(description, peerUuid, callDoc)}).catch(errorHandler);
    }
  
    
  }else{
    console.log("connection error")
  }


}

async function processIce(event, peerUuid, callDoc){
  console.log(event.candidate)
  
  
  let ice = event.candidate.toJSON()


  let signal = {
    ice: JSON.stringify(ice),
    uuid: localuuid,
    destination: peerUuid
  }
  
  //wait until candidate is ready
  await timeout(3000)
  updateDoc(callDoc, { signal }).then(() => console.log("added on ice success"))
}
async function gotIceCandidate(event, peerUuid, callDoc) {
  
  if (event.candidate != null) {
     processIce(event,peerUuid,callDoc)

    
  } 
}
// stop the remote video
async function stop(event, uuid) {
  
  const index = AddedPeers.indexOf(uuid);
  if (index > -1) {
    AddedPeers.splice(index, 1);
  }

  
}

function checkPeerDisconnect(event, peerUuid) {
  console.log("checking")
  var state = peerConnections[peerUuid].pc.iceConnectionState;
  console.log(`connection with peer ${peerUuid} ${state}`);
  if (state === "failed" || state === "closed" || state === "disconnected") {


    document.getElementById('remoteVideo_' + peerUuid).srcObject = null
    document.getElementById('videos').removeChild(document.getElementById('remoteVideo_' + peerUuid));
    
    updateLayout();
  }

}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function createUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}


