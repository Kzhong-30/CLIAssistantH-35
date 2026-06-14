const { io } = require("socket.io-client");
const http = require("http");
const SERVER_URL = "http://localhost:3001";

let passed = 0, failed = 0, total = 0;

function assert(name, cond, detail) {
  total++;
  if (cond) { passed++; console.log("[PASS]", name); }
  else { failed++; console.log("[FAIL]", name, detail || ""); }
}

function waitEvent(socket, eventName, timeoutMs) {
  const t = timeoutMs || 5000;
  return Promise.race([
    new Promise((resolve) => { socket.once(eventName, (data) => resolve({ event: eventName, data })); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for " + eventName)), t)),
  ]);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function httpCreateRoom(body) {
  const payload = body || { name: "Test", hostName: "System", maxParticipants: 10 };
  const postData = JSON.stringify(payload);
  const opts = { hostname: "localhost", port: 3001, path: "/rooms", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) } };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    req.on("error", reject); req.write(postData); req.end();
  });
}

function makeSocket() { return io(SERVER_URL + "/signaling", { transports: ["websocket"] }); }

function httpGetRoom(roomId) {
  const opts = { hostname: "localhost", port: 3001, path: "/rooms/" + roomId, method: "GET" };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(d) })); });
    req.on("error", reject); req.end();
  });
}

async function runTests() {
  try {
    console.log("=== Socket.io Signaling E2E Tests ===");

    console.log("--- Suite A: Basic Join / Password / Host ---");
    const rA = await httpCreateRoom({ name: "RoomA", hostName: "Alice", maxParticipants: 10 });
    assert("1. Create room returns 201", rA.status === 201, "got " + rA.status);
    const roomId = rA.body.roomId;
    const sBad = makeSocket();
    const badAck = await sBad.emitWithAck("join", { roomId, participantName: "BadGuy", temporaryPassword: "WRONG" });    assert("2. Wrong password rejected", badAck && badAck.data && badAck.data.success === false, JSON.stringify(badAck));
    sBad.disconnect();

    const alice = makeSocket();
    const aliceAck = await alice.emitWithAck("join", { roomId, participantName: "Alice", temporaryPassword: rA.body.temporaryPassword });    assert("3. Alice joined successfully", aliceAck && aliceAck.data && aliceAck.data.success, JSON.stringify(aliceAck));
    const alicePid = aliceAck.data.participantId;
    assert("4. Alice is host", aliceAck.data.isHost === true, "got isHost=" + aliceAck.data.isHost);
    await sleep(200);
    const roomDetail = await httpGetRoom(roomId);
    assert("5. Alice participantId equals room hostId", roomDetail.body.hostId === alicePid, "pid=" + alicePid + " host=" + roomDetail.body.hostId);
    const joinedPromise = waitEvent(alice, "participant-joined", 3000);
    const bob = makeSocket();
    const bobAck = await bob.emitWithAck("join", { roomId, participantName: "Bob", temporaryPassword: rA.body.temporaryPassword });    assert("6. Bob joined successfully", bobAck && bobAck.data && bobAck.data.success);
    assert("7. Bob is NOT host", bobAck.data.isHost === false);
    const bobPid = bobAck.data.participantId;
    const joinedEvt = await joinedPromise;
    assert("8. Alice received participant-joined for Bob", joinedEvt && joinedEvt.data && joinedEvt.data.participantId === bobPid, JSON.stringify(joinedEvt));

    console.log("--- Suite B: Signaling (Offer/Answer/ICE) ---");
    const offerAtBob = waitEvent(bob, "offer", 3000);
    alice.emit("offer", { roomId, targetId: bobPid, data: { type: "offer", sdp: "ALICE_OFFER_SDP" } });
    const offerRcvd = await offerAtBob;
    assert("9. Offer delivered to Bob with senderId", offerRcvd && offerRcvd.data && offerRcvd.data.senderId === alicePid && offerRcvd.data.data && offerRcvd.data.data.sdp === "ALICE_OFFER_SDP", JSON.stringify(offerRcvd));
    const answerAtAlice = waitEvent(alice, "answer", 3000);
    bob.emit("answer", { roomId, targetId: alicePid, data: { type: "answer", sdp: "BOB_ANSWER_SDP" } });
    const ansRcvd = await answerAtAlice;
    assert("10. Answer delivered to Alice with senderId", ansRcvd && ansRcvd.data && ansRcvd.data.senderId === bobPid && ansRcvd.data.data && ansRcvd.data.data.sdp === "BOB_ANSWER_SDP", JSON.stringify(ansRcvd));
    const iceAtBob = waitEvent(bob, "ice-candidate", 3000);
    alice.emit("ice-candidate", { roomId, targetId: bobPid, data: { candidate: "CAND1" } });
    const iceRcvd = await iceAtBob;
    assert("11. ICE candidate delivered to Bob with senderId", iceRcvd && iceRcvd.data && iceRcvd.data.senderId === alicePid && iceRcvd.data.data && iceRcvd.data.data.candidate === "CAND1", JSON.stringify(iceRcvd));

    console.log("--- Suite C: Broadcasting Events ---");
    const muteAtBob = waitEvent(bob, "participant-muted", 3000);
    alice.emit("mute", { roomId, type: "audio" });
    const muteEvt = await muteAtBob;
    assert("12. Mute broadcast as participant-muted", muteEvt && muteEvt.data && muteEvt.data.participantId === alicePid, JSON.stringify(muteEvt));
    const unmuteAtBob = waitEvent(bob, "participant-unmuted", 3000);
    alice.emit("unmute", { roomId, type: "audio" });
    const unmuteEvt = await unmuteAtBob;
    assert("13. Unmute broadcast as participant-unmuted", unmuteEvt && unmuteEvt.data && unmuteEvt.data.participantId === alicePid);
    const ssStartAtBob = waitEvent(bob, "screen-share-started", 3000);
    alice.emit("screen-share-start", { roomId });
    const ssStart = await ssStartAtBob;
    assert("14. Screen share start broadcast as screen-share-started", ssStart && ssStart.data && ssStart.data.participantId === alicePid);
    const ssConflictPromise = waitEvent(bob, "error", 3000);
    const conflictAck = await bob.emitWithAck("screen-share-start", { roomId });    const ssConflict = await ssConflictPromise.catch(() => ({ event: "timeout", data: null }));
    const conflictFailed = (conflictAck && conflictAck.data && conflictAck.data.success === false) || (ssConflict && ssConflict.data);
    assert("15. Second screen share rejected with error", conflictFailed === true, "ack=" + JSON.stringify(conflictAck) + " evt=" + JSON.stringify(ssConflict));
    const ssStopAtBob = waitEvent(bob, "screen-share-stopped", 3000);
    alice.emit("screen-share-stop", { roomId });
    const ssStop = await ssStopAtBob;
    assert("16. Screen share stop broadcast as screen-share-stopped", ssStop && ssStop.data && ssStop.data.participantId === alicePid);
    const chatAtBob = waitEvent(bob, "chat-message", 3000);
    alice.emit("chat", { roomId, content: "Hello from Alice" });
    const chatEvt = await chatAtBob;
    assert("17. Chat delivered as chat-message with content", chatEvt && chatEvt.data && chatEvt.data.content === "Hello from Alice" && chatEvt.data.senderId === alicePid, JSON.stringify(chatEvt));
    const hostMuteAtBob = waitEvent(bob, "host-muted", 3000);
    alice.emit("host-action", { roomId, action: "mute-participant", targetId: bobPid });
    const hostMuteEvt = await hostMuteAtBob;
    assert("18. Host can mute Bob via host-muted event", hostMuteEvt && hostMuteEvt.data && hostMuteEvt.data.participantId === bobPid, JSON.stringify(hostMuteEvt));

    console.log("--- Suite D: Host Permissions ---");
    const nonHostErrorPromise = waitEvent(alice, "error", 3000);
    const nonHostAck = await bob.emitWithAck("host-action", { roomId, action: "mute-participant", targetId: alicePid });    assert("19. Non-host host-action rejected with error", nonHostAck && nonHostAck.data && nonHostAck.data.success === false, JSON.stringify(nonHostAck));
    await nonHostErrorPromise.catch(()=>{});
    const leftPromise = waitEvent(alice, "participant-left", 3000);
    bob.emit("leave", { roomId });
    const leftEvt = await leftPromise;
    assert("20. Leave broadcast as participant-left", leftEvt && leftEvt.data && leftEvt.data.participantId === bobPid, JSON.stringify(leftEvt));
    bob.disconnect();

    console.log("--- Suite E: Host Remove + Auto Host Transfer ---");
    const rB = await httpCreateRoom({ name: "RoomB", hostName: "Carol", maxParticipants: 5 });
    const ridB = rB.body.roomId;
    const carol = makeSocket();
    const dave = makeSocket();
    const carolAck = await carol.emitWithAck("join", { roomId: ridB, participantName: "Carol", temporaryPassword: rB.body.temporaryPassword });    const daveAck = await dave.emitWithAck("join", { roomId: ridB, participantName: "Dave", temporaryPassword: rB.body.temporaryPassword });    const carolPid = carolAck.data.participantId;
    const davePid = daveAck.data.participantId;
    const removedByHostPromise = waitEvent(dave, "removed-by-host", 3000);
    const removedAtCarolPromise = waitEvent(carol, "participant-removed", 3000);
    carol.emit("host-action", { roomId: ridB, action: "remove-participant", targetId: davePid });
    const rbh = await removedByHostPromise;
    const rpa = await removedAtCarolPromise;
    assert("21. Host removes participant: removed-by-host + participant-removed broadcast", rbh && rbh.data && rbh.data.roomId === ridB && rpa && rpa.data && rpa.data.participantId === davePid, "rbh=" + JSON.stringify(rbh) + " rpa=" + JSON.stringify(rpa));
    dave.disconnect();
    const hostChangedPromise = waitEvent(carol, "host-changed", 5000);
    carol.emit("leave", { roomId: ridB });
    carol.disconnect();
    const hcEvt = await hostChangedPromise.catch((e)=>({event:"timeout", data:null}));
    const rC = await httpCreateRoom({ name: "RoomC", hostName: "Frank", maxParticipants: 2 });
    const ridC = rC.body.roomId;
    console.log("--- Suite F: Waiting Queue ---");
    const frank = makeSocket(); const grace = makeSocket(); const heidi = makeSocket();
    const frankAck = await frank.emitWithAck("join", { roomId: ridC, participantName: "Frank", temporaryPassword: rC.body.temporaryPassword });    const graceAck = await grace.emitWithAck("join", { roomId: ridC, participantName: "Grace", temporaryPassword: rC.body.temporaryPassword });    const queuePromise = waitEvent(heidi, "waiting-queue", 3000);
    const heidiAck = await heidi.emitWithAck("join", { roomId: ridC, participantName: "Heidi", temporaryPassword: rC.body.temporaryPassword });    const qEvt = await queuePromise.catch(()=>({event:"timeout", data:null}));
    assert("23. Full room triggers waiting-queue event with position", qEvt && qEvt.data && qEvt.data.position >= 1, JSON.stringify(qEvt));
    assert("22. Host leaves → host-changed broadcast with valid newHostId", hcEvt && hcEvt.data && hcEvt.data.newHostId && hcEvt.data.newHostId.length > 0, JSON.stringify(hcEvt));
    const admittedPromise = waitEvent(heidi, "queue-admitted", 5000);
    frank.emit("leave", { roomId: ridC });
    frank.disconnect();
    const admEvt = await admittedPromise.catch(() => ({ event: "timeout", data: null }));
    assert("24. Vacancy → queue-admitted event delivered to next waiting user", admEvt && admEvt.data && admEvt.data.roomId === ridC && admEvt.data.participantId, JSON.stringify(admEvt));
    grace.disconnect(); heidi.disconnect(); alice.disconnect();
  } finally {
    console.log("");
    console.log("Passed: " + passed + " / " + total);
    if (failed === 0) { console.log("All tests passed!"); process.exit(0); } else { console.log("Failed: " + failed); process.exit(1); }
  }
}

runTests().catch((e) => { console.error("UNEXPECTED ERROR:", e.message || e); process.exit(2); });
