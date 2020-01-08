import CREDENTIALS from "./credentials";

const AWS = require("aws-sdk");

const KVSWebRTC = require("amazon-kinesis-video-streams-webrtc");
const SignalingClient = KVSWebRTC.SignalingClient;

// AWS Credentials
const accessKeyId = CREDENTIALS.accessKeyId;
const secretAccessKey = CREDENTIALS.secretAccessKey;

const channelName = "signaling-channel-one";

const region = "eu-west-1";

const master = {
  signalingClient: null,
  peerConnectionByClientId: {},
  localStream: null
};

export default async function startMaster(localMediaStream, setOtherStreams) {
  master.localStream = localMediaStream;

  const useTrickleICE = null;

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

  console.log("[MASTER] Channel ARN: ", channelARN);

  // Get signaling channel endpoints
  const getSignalingChannelEndpointResponse = await kinesisVideoClient
    .getSignalingChannelEndpoint({
      ChannelARN: channelARN,
      SingleMasterChannelEndpointConfiguration: {
        Protocols: ["WSS", "HTTPS"],
        Role: KVSWebRTC.Role.MASTER
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
    role: KVSWebRTC.Role.MASTER,
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
      // sessionToken
    }
  });

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

  console.log("[MASTER] ICE servers: ", iceServers);

  const configuration = {
    iceServers,
    iceTransportPolicy: "all"
  };

  master.signalingClient.on("open", async () => {
    console.log("[MASTER] Connected to signaling service");
  });

  master.signalingClient.on("close", async () => {
    console.log("[MASTER] Closed signaling service");
  });
  master.signalingClient.on("error", async () => {
    console.log("[MASTER] Received an error from signaling service");
  });

  console.log(master);

  master.signalingClient.on("sdpOffer", async (offer, remoteClientId) => {
    console.log("[MASTER] Received SDP offer from client: " + remoteClientId);

    // Create a new peer connection using the offer from the given client
    const peerConnection = new RTCPeerConnection(configuration);
    master.peerConnectionByClientId[remoteClientId] = peerConnection;

    // Poll for connection stats
    // ? If we want continuos stats about peer connection
    // if (!master.peerConnectionStatsInterval) {
    //   master.peerConnectionStatsInterval = setInterval(
    //     // () => peerConnection.getStats().then(onStatsReport),
    //     () => peerConnection.getStats().then(console.log),

    //     1000
    //   );
    // }

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
      setOtherStreams([event.streams[0]]);
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

  console.log("[MASTER] Starting master connection");
  master.signalingClient.open();
}
