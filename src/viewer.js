import CREDENTIALS from "./credentials";

const AWS = require("aws-sdk");

const SignalingClient = require("amazon-kinesis-video-streams-webrtc")
  .SignalingClient;

// DescribeSignalingChannel API can also be used to get the ARN from a channel name.
// const channelARN =
//   "arn:aws:kinesisvideo:us-west-2:224466796264:channel/signaling-channel-one/1576592257758";

// AWS Credentials
const accessKeyId = CREDENTIALS.accessKeyId;
const secretAccessKey = CREDENTIALS.secretAccessKey;

const channelName = "signaling-channel-one";

// const sessionToken = "123123";
// const endpoint = "/test";

// <video> HTML elements to use to display the local webcam stream and remote stream from the master
// const localView = document.getElementsByTagName("video")[0];
// const remoteView = document.getElementsByTagName("video")[1];

const region = "eu-west-1";
// const clientId = "123";

const viewer = {
  signalingClient: null,
  peerConnectionByClientId: {},
  dataChannelByClientId: {},
  localStream: null,
  remoteStreams: [],
  peerConnectionStatsInterval: null
};

window.viewer = viewer;

export default async function startViewer(localMediaStream) {
  console.log(localMediaStream);

  // These are originally fetched from the formvalues
  const useTrickleICE = null;
  const remoteView = null;
  const localView = null;

  //   localView,
  //   remoteView
  //   formValues,
  //   onStatsReport,
  //   onRemoteDataMessage
  //   var viewer = {};
  //   viewer.localView = localView;
  //   viewer.remoteView = remoteView;

  const kinesisVideoClient = new AWS.KinesisVideo({
    region,
    accessKeyId,
    secretAccessKey
    // sessionToken
    // endpoint
  });

  console.log(kinesisVideoClient);

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
        // Role: SignalingClient.Role.MASTER
        Role: "VIEWER"
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

  // Create Signaling Client
  //   master.signalingClient = new SignalingClient({
  //     channelARN,
  //     channelEndpoint: endpointsByProtocol.WSS,
  //     // role: SignalingClient.Role.MASTER,
  //     role: "VIEWER",
  //     region: region,
  //     credentials: {
  //       accessKeyId: accessKeyId,
  //       secretAccessKey: secretAccessKey
  //       // sessionToken
  //     }
  //   });

  //   console.log(master.signalingClient);

  // Get ICE server configuration
  const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels(
    {
      region: region,
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      // sessionToken,
      endpoint: endpointsByProtocol.HTTPS
    }
  );

  console.log(kinesisVideoSignalingChannelsClient);

  const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
    .getIceServerConfig({
      ChannelARN: channelARN
    })
    .promise();

  console.log(getIceServerConfigResponse);

  const iceServers = [];
  //   if (!formValues.natTraversalDisabled && !formValues.forceTURN) {

  iceServers.push({
    urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443`
  });

  //   }
  //   if (!formValues.natTraversalDisabled) {
  getIceServerConfigResponse.IceServerList.forEach(iceServer =>
    iceServers.push({
      urls: iceServer.Uris,
      username: iceServer.Username,
      credential: iceServer.Password
    })
  );
  //   }
  console.log("[VIEWER] ICE servers: ", iceServers);

  // ! -------------

  viewer.signalingClient = new SignalingClient({
    channelARN,
    channelEndpoint: endpointsByProtocol.WSS,
    role: "VIEWER",
    clientId: "123",
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
      // sessionToken: formValues.sessionToken,
    }
  });

  const configuration = {
    iceServers,
    iceTransportPolicy: "all"
    // iceTransportPolicy: formValues.forceTURN ? "relay" : "all"
  };

  viewer.peerConnection = new RTCPeerConnection(configuration);

  // Poll for connection stats
  if (!viewer.peerConnectionStatsInterval) {
    viewer.peerConnectionStatsInterval = setInterval(
      // () => peerConnection.getStats().then(onStatsReport),
      () => viewer.peerConnection.getStats().then(console.log),
      1000
    );
  }

  viewer.signalingClient.on("open", async () => {
    console.log("[VIEWER] Connected to signaling service");

    // Get a stream from the webcam, add it to the peer connection, and display it in the local view
    try {
      viewer.localStream = localMediaStream;
      viewer.localStream
        .getTracks()
        .forEach(track =>
          viewer.peerConnection.addTrack(track, viewer.localStream)
        );
    } catch (e) {
      console.error("[VIEWER] Could not find webcam");
      return;
    }

    // Create an SDP offer to send to the master
    console.log("[VIEWER] Creating SDP offer");
    await viewer.peerConnection.setLocalDescription(
      await viewer.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
    );

    // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
    // if (formValues.useTrickleICE) {
    //   console.log("[VIEWER] Sending SDP offer");
    //   viewer.signalingClient.sendSdpOffer(
    //     viewer.peerConnection.localDescription
    //   );
    // }
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
      //   if (formValues.useTrickleICE) {
      //     console.log("[VIEWER] Sending ICE candidate");
      //     viewer.signalingClient.sendIceCandidate(candidate);
      //   }
      // } else {
      console.log("[VIEWER] All ICE candidates have been generated");

      // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
      //   if (!formValues.useTrickleICE) {
      console.log("[VIEWER] Sending SDP offer");
      viewer.signalingClient.sendSdpOffer(
        viewer.peerConnection.localDescription
      );
      //   }
    }
  });

  // As remote tracks are received, add them to the remote view
  // !Handle this!!!!!
  // viewer.peerConnection.addEventListener("track", event => {
  //   console.log("[VIEWER] Received remote track");
  //   if (remoteView.srcObject) {
  //     return;
  //   }
  //   viewer.remoteStream = event.streams[0];
  //   remoteView.srcObject = viewer.remoteStream;
  // });

  console.log("[VIEWER] Starting viewer connection");
  viewer.signalingClient.open();
}

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
