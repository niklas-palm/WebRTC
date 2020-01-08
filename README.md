## Description

A small React app to demonstrate using WebRTC with the AWS Kinesis Video Streams WebRTC API.

### Set up

Create `/src/credentials.js` file with you aws credentials.

```javascript
const CREDENTIALS = {
  accessKeyId: "aws-access-key",
  secretAccessKey: "aws-secret-access-ky"
};

export default CREDENTIALS;
```

### Running the app

Ensure you have a KVS WebRTC channel set up and that the corresponding variable inside `master.js` and `viewer.js` is set to the appropriate channel name, along with the region the channel is launched in.

A master is required when using the AWS KVS WebRTC API. Launch a master with

```bash
npm run master
```

Once a master is running, launch a viewer.

```bash
npm run viewer
```

or

```bash
npm start
```

This runs the app in the development mode.<br />
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br />
You will also see any lint errors in the console.
