import React, { useRef, useEffect, useState } from "react";
import { useUserMedia } from "./useUserMedia";

import "./App.css";
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
      // startMaster(mediaStream);
      startViewer(mediaStream);
    }
  }, [mediaStream]);

  if (mediaStream && videoRef.current && !videoRef.current.srcObject) {
    videoRef.current.srcObject = mediaStream;
  }

  const handleCanPlay = () => {
    videoRef.current.play();
  };

  // setInterval(() => {
  //   console.log(window.master.remoteStreams);
  //   // if (window.master.remoteStreams.length != otherStreams.length) {
  //   //   console.log("updated!!!!");

  //   //   setOtherStreams(window.master.remoteStreams);
  //   // }
  // }, 2000);

  const renderOtherStreams = () => {
    // if (otherStreams.length > 0) {
    if (window.master.remoteStreams.length > 0) {
      return <h1>THERES ANOTHER STREAM!!</h1>;
    }
  };

  return (
    <div className="App">
      <video
        ref={videoRef}
        onCanPlay={handleCanPlay}
        autoPlay
        playsInline
        muted
      />
      {renderOtherStreams()}
    </div>
  );
};

export default App;
