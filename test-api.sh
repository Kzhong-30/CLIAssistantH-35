export PATH="/Users/koillinjag/.nvm/versions/node/v20.20.2/bin:$PATH"
BASE="http://localhost:3001"

echo "=== 创建房间 ==="
RESP=$(curl -s -X POST $BASE/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily Standup","hostName":"Alice"}')
echo "$RESP"
echo ""

ROOM_ID=$(node -e "console.log(JSON.parse(process.argv[1]).roomId)" "$RESP")
HOST_ID=$(node -e "console.log(JSON.parse(process.argv[1]).hostId)" "$RESP")
echo "RoomID: $ROOM_ID"
echo "HostID: $HOST_ID"
echo ""

echo "=== 获取房间信息 ==="
curl -s "$BASE/rooms/$ROOM_ID"
echo ""
echo ""

echo "=== 获取通话统计 ==="
curl -s "$BASE/rooms/$ROOM_ID/stats"
echo ""
echo ""

echo "=== 开始录制 ==="
curl -s -X POST "$BASE/rooms/$ROOM_ID/recordings" \
  -H "Content-Type: application/json" \
  -d "{\"hostId\":\"$HOST_ID\",\"action\":\"start\"}"
echo ""
echo ""

echo "=== 停止录制 ==="
curl -s -X POST "$BASE/rooms/$ROOM_ID/recordings" \
  -H "Content-Type: application/json" \
  -d "{\"hostId\":\"$HOST_ID\",\"action\":\"stop\"}"
echo ""
echo ""

echo "=== 测试不存在的房间 ==="
curl -s "$BASE/rooms/notexist123"
echo ""
echo ""

echo "=== Swagger文档 ==="
echo "访问: http://localhost:3001/api"
