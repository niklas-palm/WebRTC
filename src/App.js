import React, { useEffect, useState, useRef } from "react";
import { useUserMedia } from "./useUserMedia";

import Webcam from "react-webcam";
import logo from "./logo.svg";
import "./App.css";

const CAPTURE_OPTIONS = {
  width: 1280,
  height: 720,
  audio: false,
  video: { facingMode: "user" }
};

function App() {
  const videoRef = useRef();
  const mediaStream = useUserMedia(CAPTURE_OPTIONS);

  if (mediaStream && videoRef.current && !videoRef.current.srcObject) {
    videoRef.current.srcObject = mediaStream;
  }

  function handleCanPlay() {
    videoRef.current.play();
  }

  if (mediaStream) {
    console.log(mediaStream);
  }

  return (
    <div className="App">
      <video
        ref={videoRef}
        onCanPlay={handleCanPlay}
        autoPlay
        playsInline
        muted
      />
    </div>
  );
}

export default App;
