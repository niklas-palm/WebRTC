const AWS = require("aws-sdk");

const SignalingClient = require("amazon-kinesis-video-streams-webrtc")
  .SignalingClient;

// DescribeSignalingChannel API can also be used to get the ARN from a channel name.
// const channelARN =
//   "arn:aws:kinesisvideo:us-west-2:224466796264:channel/signaling-channel-one/1576592257758";

// AWS Credentials

const channelName = "signaling-channel-one";

// <video> HTML elements to use to display the local webcam stream and remote stream from the master
// const localView = document.getElementsByTagName("video")[0];
// const remoteView = document.getElementsByTagName("video")[1];

const region = "us-west-2";
const clientId = "123";

const master = {
  signalingClient: null,
  peerConnectionByClientId: {},
  dataChannelByClientId: {},
  localStream: null,
  remoteStreams: [],
  peerConnectionStatsInterval: null
};

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
  });

  //   const kinesisVideoClient = new AWS.KinesisVideo({
  //     region: formValues.region,
  //     accessKeyId: formValues.accessKeyId,
  //     secretAccessKey: formValues.secretAccessKey,
  //     sessionToken: formValues.sessionToken,
  //     endpoint: formValues.endpoint,
  // });

  console.log(kinesisVideoClient);

  //   const getSignalingChannelEndpointResponse = await kinesisVideoClient
  //     .getSignalingChannelEndpoint({
  //       ChannelARN: channelARN,
  //       SingleMasterChannelEndpointConfiguration: {
  //         Protocols: ["WSS", "HTTPS"],
  //         Role: "VIEWER"
  //         // Role: kinesisVideoClient.Role.VIEWER
  //       }
  //     })
  //     .promise();

  const describeSignalingChannelResponse = await kinesisVideoClient
    .describeSignalingChannel({
      ChannelName: channelName
    })
    .promise();

  const channelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;

  console.log("[MASTER] Channel ARN: ", channelARN);

  // Get signaling channel endpoints
  const getSignalingChannelEndpointResponse = await kinesisVideoClient
    .getSignalingChannelEndpoint({
      ChannelARN: channelARN,
      SingleMasterChannelEndpointConfiguration: {
        Protocols: ["WSS", "HTTPS"],
        Role: "MASTER"
        // Role: KVSWebRTC.Role.MASTER
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
  console.log("[MASTER] Endpoints: ", endpointsByProtocol);

  // Create Signaling Client
  master.signalingClient = new SignalingClient({
    channelARN,
    channelEndpoint: endpointsByProtocol.WSS,
    role: "MASTER",
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
      //   sessionToken: sessionToken
    }
  });

  console.log(master.signalingClient);

  // Get ICE server configuration
  const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels(
    {
      region: region,
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      //   sessionToken: sessionToken,
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
  //       getIceServerConfigResponse.IceServerList.forEach(iceServer =>
  //           iceServers.push({
  //               urls: iceServer.Uris,
  //               username: iceServer.Username,
  //               credential: iceServer.Password,
  //           }),
  //       );
  //   }
  console.log("[MASTER] ICE servers: ", iceServers);

  const configuration = {
    iceServers,
    iceTransportPolicy: "all"
    // iceTransportPolicy: formValues.forceTURN ? "relay" : "all"
  };

  //   const resolution = formValues.widescreen
  //     ? { width: { ideal: 1280 }, height: { ideal: 720 } }
  //     : { width: { ideal: 640 }, height: { ideal: 480 } };
  //   const constraints = {
  //     video: formValues.sendVideo ? resolution : false,
  //     audio: formValues.sendAudio
  //   };

  master.signalingClient.on("open", async () => {
    console.log("[MASTER] Connected to signaling service");

    // Get a stream from the webcam and display it in the local view
    try {
      // master.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      master.localStream = localMediaStream;
      // localView.srcObject = master.localStream;
    } catch (e) {
      console.error("[MASTER] Could not find webcam");
    }
  });

  console.log(master);

  master.signalingClient.on("sdpOffer", async (offer, remoteClientId) => {
    console.log("[MASTER] Received SDP offer from client: " + remoteClientId);

    // Create a new peer connection using the offer from the given client
    const peerConnection = new RTCPeerConnection(configuration);
    master.peerConnectionByClientId[remoteClientId] = peerConnection;

    // if (formValues.openDataChannel) {
    //   master.dataChannelByClientId[
    //     remoteClientId
    //   ] = peerConnection.createDataChannel("kvsDataChannel");
    //   peerConnection.ondatachannel = event => {
    //     event.channel.onmessage = onRemoteDataMessage;
    //   };
    // }

    // Poll for connection stats
    if (!master.peerConnectionStatsInterval) {
      master.peerConnectionStatsInterval = setInterval(
        // () => peerConnection.getStats().then(onStatsReport),
        () => peerConnection.getStats().then(console.log),

        1000
      );
    }

    // Send any ICE candidates to the other peer
    peerConnection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) {
        console.log(
          "[MASTER] Generated ICE candidate for client: " + remoteClientId
        );

        // When trickle ICE is enabled, send the ICE candidates as they are generated.
        if (useTrickleICE) {
          console.log(
            "[MASTER] Sending ICE candidate to client: " + remoteClientId
          );
          master.signalingClient.sendIceCandidate(candidate, remoteClientId);
        }
      } else {
        console.log(
          "[MASTER] All ICE candidates have been generated for client: " +
            remoteClientId
        );

        // When trickle ICE is disabled, send the answer now that all the ICE candidates have ben generated.
        if (!useTrickleICE) {
          console.log(
            "[MASTER] Sending SDP answer to client: " + remoteClientId
          );
          master.signalingClient.sendSdpAnswer(
            peerConnection.localDescription,
            remoteClientId
          );
        }
      }
    });

    // As remote tracks are received, add them to the remote view
    peerConnection.addEventListener("track", event => {
      console.log(
        "[MASTER] Received remote track from client: " + remoteClientId
      );
      if (remoteView.srcObject) {
        return;
      }
      remoteView.srcObject = event.streams[0];
    });

    master.localStream
      .getTracks()
      .forEach(track => peerConnection.addTrack(track, master.localStream));
    await peerConnection.setRemoteDescription(offer);

    // Create an SDP answer to send back to the client
    console.log("[MASTER] Creating SDP answer for client: " + remoteClientId);
    await peerConnection.setLocalDescription(
      await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
    );

    // When trickle ICE is enabled, send the answer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
    if (useTrickleICE) {
      console.log("[MASTER] Sending SDP answer to client: " + remoteClientId);
      master.signalingClient.sendSdpAnswer(
        peerConnection.localDescription,
        remoteClientId
      );
    }
    console.log(
      "[MASTER] Generating ICE candidates for client: " + remoteClientId
    );
  });
}

// startViewer();
