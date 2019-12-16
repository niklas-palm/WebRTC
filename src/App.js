import React, { useRef } from "react";
import { useUserMedia } from "./useUserMedia";

import "./App.css";

const CAPTURE_OPTIONS = {
  audio: false,
  video: { facingMode: "user" }
};

const App = () => {
  const videoRef = useRef();
  const mediaStream = useUserMedia(CAPTURE_OPTIONS);

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
