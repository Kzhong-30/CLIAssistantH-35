const http = require('http');

function req(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const r = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

(async () => {
  console.log('=== 1. 创建房间 ===');
  const r1 = await req('POST', '/rooms', { name: 'Daily Standup', hostName: 'Alice' });
  console.log('Status:', r1.status);
  console.log(JSON.stringify(r1.body, null, 2));

  const roomId = r1.body.roomId;
  const hostId = r1.body.hostId;

  console.log();
  console.log('=== 2. 获取房间信息 ===');
  const r2 = await req('GET', '/rooms/' + roomId);
  console.log('Status:', r2.status);
  console.log(JSON.stringify(r2.body, null, 2));

  console.log();
  console.log('=== 3. 获取通话统计 ===');
  const r3 = await req('GET', '/rooms/' + roomId + '/stats');
  console.log('Status:', r3.status);
  console.log(JSON.stringify(r3.body, null, 2));

  console.log();
  console.log('=== 4. 开始录制 ===');
  const r4 = await req('POST', '/rooms/' + roomId + '/recordings', { hostId, action: 'start' });
  console.log('Status:', r4.status);
  console.log(JSON.stringify(r4.body, null, 2));

  console.log();
  console.log('=== 5. 停止录制 ===');
  const r5 = await req('POST', '/rooms/' + roomId + '/recordings', { hostId, action: 'stop' });
  console.log('Status:', r5.status);
  console.log(JSON.stringify(r5.body, null, 2));

  console.log();
  console.log('=== 6. 不存在的房间 (404测试) ===');
  const r6 = await req('GET', '/rooms/notexist123');
  console.log('Status:', r6.status);
  console.log(JSON.stringify(r6.body, null, 2));

  console.log();
  console.log('=== 7. 创建房间参数验证 (空body) ===');
  const r7 = await req('POST', '/rooms', {});
  console.log('Status:', r7.status);
  console.log(JSON.stringify(r7.body, null, 2));

  console.log();
  console.log('=== 8. 非主持人操作录制 (权限测试) ===');
  const r8 = await req('POST', '/rooms/' + roomId + '/recordings', { hostId: 'fakeId123', action: 'start' });
  console.log('Status:', r8.status);
  console.log(JSON.stringify(r8.body, null, 2));

  console.log();
  console.log('所有 HTTP API 测试完成!');
  console.log('Swagger UI: http://localhost:3001/api');
})().catch(console.error);
