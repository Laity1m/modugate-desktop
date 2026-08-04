const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateVideo, normalizeVideoOptions, extractVideoResult } = require('../core/video-api');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address())));
}

test('normalizeVideoOptions applies safe defaults and validates input', () => {
  const value = normalizeVideoOptions({ prompt: 'test', duration: 10, ratio: '9:16' });
  assert.equal(value.model, 'jimeng-video-seedance-2.0-fast');
  assert.equal(value.duration, 10);
  assert.equal(value.ratio, '9:16');
  assert.throws(() => normalizeVideoOptions({}), /视频提示词/);
});

test('all-reference options accept image, video, and audio media', () => {
  const value = normalizeVideoOptions({
    prompt: '@image_file_1 的动作跟随 @audio_file_1',
    model: 'jimeng-video-seedance-2.0-fast',
    duration: 12,
    references: [
      { filePath: 'first.png', type: 'image' },
      { filePath: 'motion.mp4', type: 'video' },
      { filePath: 'music.mp3', type: 'audio' }
    ]
  });
  assert.equal(value.referenceMode, 'omni_reference');
  assert.equal(value.duration, 12);
  assert.deepEqual(value.references.map((item) => item.type), ['image', 'video', 'audio']);
});

test('extractVideoResult recognizes direct and markdown URLs', () => {
  const result = extractVideoResult({
    id: 'task-1',
    choices: [{ message: { content: '完成：[播放](https://cdn.example/video.mp4)' } }]
  });
  assert.equal(result.taskId, 'task-1');
  assert.deepEqual(result.urls, ['https://cdn.example/video.mp4']);
});

test('video generation sends OpenAI-compatible JSON and parses result', async (t) => {
  let received;
  const server = http.createServer((request, response) => {
    if (request.url !== '/v1/videos/generations') return response.writeHead(404).end();
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'video-request-1' });
      response.end(JSON.stringify({ created: 1, data: [{ url: 'https://cdn.example/result.mp4' }] }));
    });
  });
  const address = await listen(server);
  t.after(() => server.close());

  const result = await generateVideo({
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'session-test'
  }, { prompt: '海边日落', model: 'jimeng-video-3.0', duration: 5 });

  assert.equal(received.prompt, '海边日落');
  assert.equal(received.duration, 5);
  assert.equal(result.requestId, 'video-request-1');
  assert.deepEqual(result.urls, ['https://cdn.example/result.mp4']);
});

test('chat compatibility mode uses chat completions and extracts video URL', async (t) => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { content: '视频已生成 https://cdn.example/chat-result.mp4' } }]
    }));
  });
  const address = await listen(server);
  t.after(() => server.close());
  const result = await generateVideo({ baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'x' }, {
    protocol: 'chat', prompt: 'test'
  });
  assert.deepEqual(result.urls, ['https://cdn.example/chat-result.mp4']);
});

test('all-reference request sends typed multipart fields and function mode', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modugate-video-media-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, 'first.png');
  const videoPath = path.join(directory, 'motion.mp4');
  const audioPath = path.join(directory, 'music.mp3');
  fs.writeFileSync(imagePath, Buffer.from('image-test'));
  fs.writeFileSync(videoPath, Buffer.from('video-test'));
  fs.writeFileSync(audioPath, Buffer.from('audio-test'));
  let received = '';
  const server = http.createServer((request, response) => {
    request.setEncoding('latin1');
    request.on('data', (chunk) => { received += chunk; });
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ url: 'https://cdn.example/omni.mp4' }] }));
    });
  });
  const address = await listen(server);
  t.after(() => server.close());
  const result = await generateVideo({ baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'x' }, {
    prompt: '@image_file_1 参考 @video_file_1 的运动并使用 @audio_file_1',
    model: 'jimeng-video-seedance-2.0-fast',
    referenceMode: 'omni_reference',
    references: [
      { filePath: imagePath, type: 'image' },
      { filePath: videoPath, type: 'video' },
      { filePath: audioPath, type: 'audio' }
    ]
  });
  assert.match(received, /name="functionMode"\r\n\r\nomni_reference/);
  assert.match(received, /name="image_file_1"; filename="first.png"/);
  assert.match(received, /name="video_file_1"; filename="motion.mp4"/);
  assert.match(received, /name="audio_file_1"; filename="music.mp3"/);
  assert.deepEqual(result.urls, ['https://cdn.example/omni.mp4']);
});
