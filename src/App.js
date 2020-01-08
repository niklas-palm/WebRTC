import React, { useRef, useEffect, useState } from "react";
import { useUserMedia } from "./useUserMedia";

import "./styles/App.scss";

import startMaster from "./master";
import startViewer from "./viewer";

const CAPTURE_OPTIONS = {
  audio: false,
  video: { facingMode: "user" }
};

const App = () => {
  const [otherStreams, setOtherStreams] = useState([]);
  const videoRef = useRef();

  const mediaStream = useUserMedia(CAPTURE_OPTIONS);

  useEffect(() => {
    console.log("useEffect run");

    if (mediaStream) {
      console.log(mediaStream);

      process.env.REACT_APP_MASTER
        ? startMaster(mediaStream, setOtherStreams)
        : startViewer(mediaStream, setOtherStreams);

      // startMaster(mediaStream, setOtherStreams);
      // startViewer(mediaStream, setOtherStreams);
    }
  }, [mediaStream]);

  useEffect(() => {
    if (otherStreams.length > 0) {
      console.log("otherStreams changed");
      console.log("Num other streams: ", otherStreams.length);
      console.log("Stream to add: ", otherStreams[0]);

      let other = document.querySelector("#other_stream");
      console.log("Stream will be added as source to: ", other);
      other.srcObject = otherStreams[0];
    }
  }, [otherStreams]);

  if (mediaStream && videoRef.current && !videoRef.current.srcObject) {
    videoRef.current.srcObject = mediaStream;
  }

  console.log("App re-rendered. Other streams: ", otherStreams);

  const handleCanPlay = () => {
    videoRef.current.play();
  };

  return (
    <div className="Container">
      <video
        className="SelfVideo"
        ref={videoRef}
        onCanPlay={handleCanPlay}
        autoPlay
        playsInline
        muted
      />

      <div className="OtherStreams">
        <h2>Other stream</h2>
        <video
          id="other_stream"
          className="OtherVideo"
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  );
};

export default App;
