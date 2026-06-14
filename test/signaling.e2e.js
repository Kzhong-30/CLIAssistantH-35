const http = require("http");
const { io } = require("socket.io-client");

const SERVER = process.env.SIGNALING_SERVER || "http://localhost:3001";

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const passed = [];
const failed = [];

function assert(name, condition, detail) {
  if (condition) {
    passed.push(name);
    console.log("[PASS] " + name);
  } else {
    failed.push(name);
    console.log("[FAIL] " + name + (detail ? " (" + detail + ")" : ""));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== Creating room via HTTP ===");
  const createRes = await httpRequest("POST", "/rooms", {
    name: "E2E Test Room",
    hostName: "Alice",
  });
  assert("Create room returns 201", createRes.status === 201);
  const roomId = createRes.body.roomId;
  const tempPwd = createRes.body.temporaryPassword;
  console.log("Room: " + roomId + ", Pwd: " + tempPwd);

  // --- 1. Wrong password ---
  console.log("\n=== 1. Join with wrong password ===");
  const eve = io(SERVER);
  let eveError = null;
  eve.once("error", (msg) => {
    eveError = msg;
  });
  await new Promise((r) => eve.on("connect", r));
  eve.emit("join", { roomId, name: "Eve", password: "wrongpassword" });
  await sleep(500);
  assert(
    "Wrong password rejected",
    eveError !== null && eveError.message === "Invalid room password",
    eveError ? eveError.message : "no error received"
  );
  eve.disconnect();

  // --- 2. Alice joins as first participant (host) ---
  console.log("\n=== 2. Alice joins as host ===");
  const alice = io(SERVER);
  let aliceJoined = null;
  alice.once("joined", (d) => {
    aliceJoined = d;
  });
  await new Promise((r) => alice.on("connect", r));
  alice.emit("join", { roomId, name: "Alice", password: tempPwd });
  await sleep(500);
  assert("Alice joined successfully", aliceJoined !== null);
  assert("Alice is host", aliceJoined && aliceJoined.isHost === true);
  const aliceId = aliceJoined ? aliceJoined.participantId : null;

  const roomInfo = await httpRequest("GET", "/rooms/" + roomId);
  assert(
    "Alice participantId equals room hostId",
    roomInfo.body && roomInfo.body.hostId === aliceId,
    "hostId=" + (roomInfo.body && roomInfo.body.hostId) + " aliceId=" + aliceId
  );

  // --- 3. Bob joins as second participant ---
  console.log("\n=== 3. Bob joins as second participant ===");
  const bob = io(SERVER);
  let bobJoined = null;
  let aliceSawBobJoin = null;
  alice.once("participant-joined", (d) => {
    aliceSawBobJoin = d;
  });
  bob.once("joined", (d) => {
    bobJoined = d;
  });
  await new Promise((r) => bob.on("connect", r));
  bob.emit("join", { roomId, name: "Bob", password: tempPwd });
  await sleep(500);
  assert("Bob joined successfully", bobJoined !== null);
  assert("Bob is NOT host", bobJoined && bobJoined.isHost === false);
  assert(
    "Alice received participant-joined for Bob",
    aliceSawBobJoin &&
      aliceSawBobJoin.participant &&
      aliceSawBobJoin.participant.name === "Bob"
  );
  const bobId = bobJoined ? bobJoined.participantId : null;

  // --- 4. Offer / Answer ---
  console.log("\n=== 4. Offer/Answer signaling ===");
  let bobGotOffer = null;
  bob.once("offer", (d) => {
    bobGotOffer = d;
  });
  alice.emit("offer", {
    roomId,
    targetId: bobId,
    data: "v=0 o=- 1 2 IN IP4 127.0.0.1",
  });
  await sleep(300);
  assert(
    "Offer delivered to Bob with senderId",
    bobGotOffer !== null &&
      bobGotOffer.senderId === aliceId &&
      bobGotOffer.data !== undefined
  );

  let aliceGotAnswer = null;
  alice.once("answer", (d) => {
    aliceGotAnswer = d;
  });
  bob.emit("answer", {
    roomId,
    targetId: aliceId,
    data: "v=0 o=- 3 4 IN IP4 127.0.0.1",
  });
  await sleep(300);
  assert(
    "Answer delivered to Alice with senderId",
    aliceGotAnswer !== null &&
      aliceGotAnswer.senderId === bobId &&
      aliceGotAnswer.data !== undefined
  );

  // --- 5. ICE candidate ---
  console.log("\n=== 5. ICE candidate signaling ===");
  let bobGotIce = null;
  bob.once("ice-candidate", (d) => {
    bobGotIce = d;
  });
  alice.emit("ice-candidate", {
    roomId,
    targetId: bobId,
    data: "candidate:1 1 udp 2113937151 192.168.1.1 50000 typ host",
  });
  await sleep(300);
  assert(
    "ICE candidate delivered to Bob with senderId",
    bobGotIce !== null &&
      bobGotIce.senderId === aliceId &&
      bobGotIce.data !== undefined
  );

  // --- 6. Mute / Unmute ---
  console.log("\n=== 6. Mute/Unmute broadcast ===");
  let bobGotMute = null;
  bob.once("participant-muted", (d) => {
    bobGotMute = d;
  });
  alice.emit("mute", { roomId, type: "audio" });
  await sleep(300);
  assert(
    "Mute broadcast as participant-muted",
    bobGotMute !== null && bobGotMute.type === "audio"
  );

  let bobGotUnmute = null;
  bob.once("participant-unmuted", (d) => {
    bobGotUnmute = d;
  });
  alice.emit("unmute", { roomId, type: "audio" });
  await sleep(300);
  assert(
    "Unmute broadcast as participant-unmuted",
    bobGotUnmute !== null && bobGotUnmute.type === "audio"
  );

  // --- 7. Screen share start / stop / conflict ---
  console.log("\n=== 7. Screen share start/stop/conflict ===");
  let bobGotScreenStart = null;
  bob.once("screen-share-started", (d) => {
    bobGotScreenStart = d;
  });
  alice.emit("screen-share-start", { roomId });
  await sleep(300);
  assert(
    "Screen share start broadcast as screen-share-started",
    bobGotScreenStart !== null && bobGotScreenStart.participantId === aliceId
  );

  let bobScreenConflict = null;
  bob.once("error", (d) => {
    if (d.event === "screen-share-start") bobScreenConflict = d;
  });
  bob.emit("screen-share-start", { roomId });
  await sleep(300);
  assert(
    "Second screen share rejected with error",
    bobScreenConflict !== null,
    JSON.stringify(bobScreenConflict)
  );

  let bobGotScreenStop = null;
  bob.once("screen-share-stopped", (d) => {
    bobGotScreenStop = d;
  });
  alice.emit("screen-share-stop", { roomId });
  await sleep(300);
  assert(
    "Screen share stop broadcast as screen-share-stopped",
    bobGotScreenStop !== null && bobGotScreenStop.participantId === aliceId,
    JSON.stringify(bobGotScreenStop)
  );

  // --- 8. Chat message ---
  console.log("\n=== 8. Chat message broadcast ===");
  let bobGotChat = null;
  bob.once("chat-message", (d) => {
    bobGotChat = d;
  });
  alice.emit("chat", { roomId, content: "Hello everyone!" });
  await sleep(300);
  assert(
    "Chat delivered as chat-message with content",
    bobGotChat !== null &&
      bobGotChat.content === "Hello everyone!" &&
      bobGotChat.senderName === "Alice"
  );

  // --- 9. Host action: mute-participant ---
  console.log("\n=== 9. Host action: mute-participant ===");
  let bobGotHostMute = null;
  bob.once("host-muted", (d) => {
    bobGotHostMute = d;
  });
  alice.emit("host-action", {
    roomId,
    action: "mute-participant",
    targetId: bobId,
  });
  await sleep(300);
  assert(
    "Host can mute Bob via host-muted event",
    bobGotHostMute !== null && bobGotHostMute.byHost === aliceId
  );

  // --- 10. Non-host cannot perform host action ---
  console.log("\n=== 10. Non-host host-action rejected ===");
  let bobHostActionErr = null;
  bob.once("error", (d) => {
    if (d.event === "host-action") bobHostActionErr = d;
  });
  bob.emit("host-action", {
    roomId,
    action: "mute-participant",
    targetId: aliceId,
  });
  await sleep(300);
  assert(
    "Non-host host-action rejected with error",
    bobHostActionErr !== null &&
      bobHostActionErr.message === "Only host can perform this action",
    JSON.stringify(bobHostActionErr)
  );

  // --- 11. Leave event broadcast ---
  console.log("\n=== 11. Leave event broadcast ===");
  let aliceGotLeave = null;
  alice.once("participant-left", (d) => {
    aliceGotLeave = d;
  });
  bob.emit("leave", { roomId });
  await sleep(300);
  assert(
    "Leave broadcast as participant-left",
    aliceGotLeave !== null && aliceGotLeave.participantId === bobId
  );

  bob.disconnect();
  alice.disconnect();

  console.log("\n========== SUMMARY ==========");
  console.log("Passed: " + passed.length + " / " + (passed.length + failed.length));
  if (failed.length > 0) {
    console.log("Failed tests:");
    failed.forEach((n) => console.log("  - " + n));
    process.exit(1);
  } else {
    console.log("All tests passed!");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
