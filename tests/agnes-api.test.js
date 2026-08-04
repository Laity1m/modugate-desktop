const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { durationToFrames, dimensionsFor, extractVideoUrl, generateAgnesVideo } = require('../core/agnes-api');

test('Agnes parameters use valid frames and dimensions', () => {
  assert.equal(durationToFrames(5) % 8, 1);
  assert.equal(durationToFrames(30) <= 441, true);
  assert.equal(durationToFrames(30) % 8, 1);
  assert.deepEqual(dimensionsFor('9:16', '720p'), [720, 1280]);
  assert.equal(extractVideoUrl({ data: { output: { video_url: 'https://cdn.example/video.mp4' } } }), 'https://cdn.example/video.mp4');
});

test('Agnes client submits, polls and returns final video URL', async (t) => {
  const seen = [];
  let polls = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      seen.push({ url: request.url, auth: request.headers.authorization, body });
      response.setHeader('content-type', 'application/json');
      if (request.method === 'POST' && request.url === '/v1/videos') {
        response.end(JSON.stringify({ video_id: 'video-123', status: 'queued' }));
      } else if (request.url.startsWith('/agnesapi?')) {
        polls += 1;
        response.end(JSON.stringify(polls === 1
          ? { video_id: 'video-123', status: 'in_progress' }
          : { video_id: 'video-123', status: 'completed', video_url: 'https://cdn.example/final.mp4' }));
      } else response.writeHead(404).end('{}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await generateAgnesVideo({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: 'agnes-secret'
  }, { model: 'agnes-video-v2.0', prompt: '海边日落', ratio: '16:9', resolution: '720p', duration: 5 }, {
    pollIntervalMs: 10,
    timeoutMs: 1000
  });
  assert.deepEqual(result.urls, ['https://cdn.example/final.mp4']);
  assert.equal(result.taskId, 'video-123');
  assert.equal(seen.every((item) => item.auth === 'Bearer agnes-secret'), true);
  const submitted = JSON.parse(seen[0].body);
  assert.equal(submitted.width, 1280);
  assert.equal(submitted.num_frames % 8, 1);
});

test('Agnes client reports failed tasks', async (t) => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST') response.end(JSON.stringify({ video_id: 'bad-1', status: 'queued' }));
    else response.end(JSON.stringify({ status: 'failed', message: '积分不足' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  await assert.rejects(() => generateAgnesVideo({
    baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'key'
  }, { prompt: 'test' }, { pollIntervalMs: 10, timeoutMs: 500 }), /积分不足/);
});
