const params = new URLSearchParams(window.location.search);
const root = params.get('root') || 'http://127.0.0.1:8080';
document.querySelector('#root-value').textContent = root;
document.querySelector('#reason-value').textContent = params.get('reason') || '无法连接网关';
document.querySelector('#retry-console').addEventListener('click', () => window.location.assign(root));
document.querySelector('#close-window').addEventListener('click', () => window.close());

