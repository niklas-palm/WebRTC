import CREDENTIALS from "./credentials";

const AWS = require("aws-sdk");
const uuidv4 = require("uuid/v4");

const KVSWebRTC = require("amazon-kinesis-video-streams-webrtc");
const SignalingClient = KVSWebRTC.SignalingClient;

// AWS Credentials
const accessKeyId = CREDENTIALS.accessKeyId;
const secretAccessKey = CREDENTIALS.secretAccessKey;

// TODO: This name will be fetched from the meeting.
const channelName = "signaling-channel-one";

const region = "eu-west-1";
const clientId = uuidv4();

const viewer = {
  signalingClient: null,
  localStream: null,
  peerConnectionStatsInterval: null
};

export default async function startViewer(localMediaStream, setOtherStreams) {
  viewer.localStream = localMediaStream;

  // Send ICE candidates as they are generated. Best performance.
  const useTrickleICE = true;

  // Create KVS klient
  const kinesisVideoClient = new AWS.KinesisVideo({
    region,
    accessKeyId,
    secretAccessKey
    // sessionToken
  });

  // Get Channel ARN based on provided channel name (depends on meeting room)
  const describeSignalingChannelResponse = await kinesisVideoClient
    .describeSignalingChannel({
      ChannelName: channelName
    })
    .promise();

  const channelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;

  console.log("[VIEWER] Channel ARN: ", channelARN);

  // Get signaling channel endpoints
  const getSignalingChannelEndpointResponse = await kinesisVideoClient
    .getSignalingChannelEndpoint({
      ChannelARN: channelARN,
      SingleMasterChannelEndpointConfiguration: {
        Protocols: ["WSS", "HTTPS"],
        Role: KVSWebRTC.Role.VIEWER
      }
    })
    .promise();

  const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
    (endpoints, endpoint) => {
      endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
      return endpoints;
    },
    {}
  );
  console.log("[VIEWER] Endpoints: ", endpointsByProtocol);

  // Get ICE server configuration
  const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels(
    {
      region: region,
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      endpoint: endpointsByProtocol.HTTPS
    }
  );

  const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
    .getIceServerConfig({
      ChannelARN: channelARN
    })
    .promise();

  const iceServers = [];
  iceServers.push({
    urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443`
  });

  getIceServerConfigResponse.IceServerList.forEach(iceServer =>
    iceServers.push({
      urls: iceServer.Uris,
      username: iceServer.Username,
      credential: iceServer.Password
    })
  );

  console.log("[VIEWER] ICE servers: ", iceServers);

  // Create Viewer signaling client
  viewer.signalingClient = new SignalingClient({
    channelARN,
    channelEndpoint: endpointsByProtocol.WSS,
    role: KVSWebRTC.Role.VIEWER,
    clientId,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
      // sessionToken
    }
  });

  const configuration = {
    iceServers,
    iceTransportPolicy: "all"
  };

  viewer.peerConnection = new RTCPeerConnection(configuration);

  // Poll for connection stats
  // ? If we want continuos stats about peer connection
  if (!viewer.peerConnectionStatsInterval) {
    viewer.peerConnectionStatsInterval = setInterval(
      () => viewer.peerConnection.getStats().then(console.log),
      1000
    );
  }

  viewer.signalingClient.on("open", async () => {
    console.log("[VIEWER] Connected to signaling service");

    // Add local stream to peerconnection.
    // Triggers 'track' event on master
    viewer.localStream
      .getTracks()
      .forEach(track =>
        viewer.peerConnection.addTrack(track, viewer.localStream)
      );

    // Create an SDP offer to send to the master
    console.log("[VIEWER] Creating SDP offer");
    await viewer.peerConnection.setLocalDescription(
      await viewer.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
    );

    // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
    if (useTrickleICE) {
      console.log("[VIEWER] Sending SDP offer");
      viewer.signalingClient.sendSdpOffer(
        viewer.peerConnection.localDescription
      );
    }
    console.log("[VIEWER] Generating ICE candidates");
  });

  viewer.signalingClient.on("sdpAnswer", async answer => {
    // Add the SDP answer to the peer connection
    console.log("[VIEWER] Received SDP answer");
    await viewer.peerConnection.setRemoteDescription(answer);
  });

  viewer.signalingClient.on("iceCandidate", candidate => {
    // Add the ICE candidate received from the MASTER to the peer connection
    console.log("[VIEWER] Received ICE candidate");
    viewer.peerConnection.addIceCandidate(candidate);
  });

  viewer.signalingClient.on("close", () => {
    console.log("[VIEWER] Disconnected from signaling channel");
  });

  viewer.signalingClient.on("error", error => {
    console.error("[VIEWER] Signaling client error: ", error);
  });

  // Send any ICE candidates to the other peer
  viewer.peerConnection.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) {
      console.log("[VIEWER] Generated ICE candidate");

      // When trickle ICE is enabled, send the ICE candidates as they are generated.
      if (useTrickleICE) {
        console.log("[VIEWER] Sending ICE candidate");
        viewer.signalingClient.sendIceCandidate(candidate);
      }
    } else {
      console.log("[VIEWER] All ICE candidates have been generated");

      // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
      if (!useTrickleICE) {
        console.log("[VIEWER] Sending SDP offer");
        viewer.signalingClient.sendSdpOffer(
          viewer.peerConnection.localDescription
        );
      }
    }
  });

  // As remote tracks are received, handle them
  viewer.peerConnection.addEventListener("track", event => {
    console.log("[VIEWER] Received remote track");
    setOtherStreams([event.streams[0]]);
  });

  console.log("[VIEWER] Starting viewer connection");
  viewer.signalingClient.open();
}

// TODO use stopViewer() when it becomes necessary
function stopViewer() {
  console.log("[VIEWER] Stopping viewer connection");
  if (viewer.signalingClient) {
    viewer.signalingClient.close();
    viewer.signalingClient = null;
  }

  if (viewer.peerConnection) {
    viewer.peerConnection.close();
    viewer.peerConnection = null;
  }

  if (viewer.localStream) {
    viewer.localStream.getTracks().forEach(track => track.stop());
    viewer.localStream = null;
  }

  if (viewer.remoteStream) {
    viewer.remoteStream.getTracks().forEach(track => track.stop());
    viewer.remoteStream = null;
  }

  if (viewer.peerConnectionStatsInterval) {
    clearInterval(viewer.peerConnectionStatsInterval);
    viewer.peerConnectionStatsInterval = null;
  }

  if (viewer.localView) {
    viewer.localView.srcObject = null;
  }

  if (viewer.remoteView) {
    viewer.remoteView.srcObject = null;
  }

  if (viewer.dataChannel) {
    viewer.dataChannel = null;
  }
}
