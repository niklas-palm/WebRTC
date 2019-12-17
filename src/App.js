import React, { useRef, useEffect } from "react";
import { useUserMedia } from "./useUserMedia";

import "./App.css";
import startViewer from "./webrtc.js";

const CAPTURE_OPTIONS = {
  audio: false,
  video: { facingMode: "user" }
};

const App = () => {
  const videoRef = useRef();
  const mediaStream = useUserMedia(CAPTURE_OPTIONS);

  useEffect(() => {
    console.log("useEffect run");

    if (mediaStream) {
      startViewer(mediaStream);
    }
  }, [mediaStream]);

  if (mediaStream && videoRef.current && !videoRef.current.srcObject) {
    videoRef.current.srcObject = mediaStream;
  }

  const handleCanPlay = () => {
    videoRef.current.play();
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
    </div>
  );
};

export default App;
