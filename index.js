const fs = require('fs');
const request = require('request');
const rp = require('request-promise-native');

const Jetty = require('jetty');
const tty = new Jetty(process.stdout);
tty.reset().clear().moveTo([0, 0]);

const {
  delay,
  domain,
  thresholds,
  timeout
} = require('./config');

let completed = 0;
const limit = process.stdout.rows - 1;
let proxies = [];
let chunks = [];
let chunksCompleted = 0;
const times = {};

// Jetty Colors
const colors = {
  white: [5,5,5],
  blue:  [0,0,5],
  red:   [5,0,0],
  green: [0,3,0],
  black: [0,0,0],
  gray:  [2,2,2]
};

// Jetty Styles
const styles = {
  index: function (str) {
    this
      .bold()
      .rgb(colors.black, 1)
      .rgb(colors.white)
      .text(str)
      .reset();
  },
  good: function (str) {
    this
      .rgb(colors.green, 1)
      .rgb(colors.white)
      .text(str)
      .reset();
  },
  bad: function (str) {
    this
    .bold()
    .rgb(colors.red, 1)
    .rgb(colors.white)
    .text(str)
    .reset();
  },
  neutral: function (str) {
    this
    .rgb(colors.gray, 1)
    .rgb(colors.white)
    .text(str)
    .reset();
  },
};

// Headers for request
const headers = {
  Host: domain,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US',
  'Accept-Encoding': 'br, gzip, deflate',
  Connection: 'keep-alive',
};

// Options for request
const getOptions = () => ({
  url: `http://${domain}`,
  headers,
  method: 'get',
  gzip: true,
  resolveWithFullResponse: true,
  timeout,
  jar: request.jar()
});

const getTimeStyle = (time) => {
  if (time < thresholds.good) return styles.good;
  if (time < thresholds.bad) return styles.neutral;
  return styles.bad;
};

const getMessageStyle = (message) => {
  if (message.includes('200')) return styles.good;
  return styles.bad;
};

const updateLine = (index, proxy, message, time = false) => {
  let p = proxy.replace('http://', '');
  if (p.includes('@')) [, p] = p.split('@');
  const i = `000${chunksCompleted * limit + index}`.slice(-4);

  if (time) {
    const timeStyle = getTimeStyle(time);
    const messageStyle = getMessageStyle(message);

    tty
      .moveTo([index - 1, 0])
      .text(`${i} - ${p} `, styles.index)
      .text(' ')
      .text(` ${(time / 1000).toFixed(3)}s `, timeStyle)
      .text(' ')
      .text(` ${message} `, messageStyle)
      .text('\n');
  } else {
    tty
      .moveTo([index - 1, 0])
      .text(`${i} - ${p} `, styles.index)
      .text(' ')
      .text(` ${message} `)
      .text('\n');
  }
};

// Proxy file to proxy object
const formatProxies = () => {
  const rawProxies = fs.readFileSync('./proxies.txt', 'utf-8');
  const split = rawProxies.trim().split('\n');

  for (const p of split) {
    const parts = p.trim().split(':');
    const [ip, port, user, pass] = parts;
    proxies.push({
      ip, port, user, pass
    });
  }
};

// Groups proxies into chunks
const blowChunks = () => {
  const fullChunks = Math.floor(proxies.length / limit);
  const lastChunk = proxies.length % limit;

  for (let i = 0; i < fullChunks; i += 1) {
    chunks.push(proxies.slice(i * limit, i * limit + limit));
  }

  chunks.push(proxies.slice(fullChunks * limit, fullChunks * limit + lastChunk));
};

// Test a proxy
const test = async (index, proxy) => {
  updateLine(index, proxy, 'Running...');
  times[index] = new Date().getTime();

  try {
    const response = await rp(Object.assign({ proxy }, getOptions()));

    completed += 1;

    const now = new Date().getTime();
    const time = now - times[index];

    updateLine(index, proxy, response.statusCode.toString(), time);
  } catch (e) {
    completed += 1;

    const now = new Date().getTime();
    const time = ((now - times[index]) / 1000).toFixed(3);
    updateLine(index, proxy, e.statusCode || e.message, time);
  }
};

// Run em all
const run = async () => {
  proxies = chunks.shift();

  for (let i = 0; i < proxies.length; i += 1) {
    const p = proxies[i];
    let proxy = `${p.ip}:${p.port}`;
    if (p.user) proxy = `${p.user}:${p.pass}@${proxy}`;
    proxy = `http://${proxy}`;

    const index = i + 1;

    setTimeout(() => { // eslint-disable-line
      test(index, proxy);
    }, index * delay);
  }
};

const start = async () => {
  formatProxies();
  blowChunks();

  run();
}

start();

// Have to do this so the process doesn't exit before all requests have completed
const interval = setInterval(() => {
  if (completed >= proxies.length) {
    completed = 0;
    chunksCompleted += 1;

    if (chunks.length > 0) {
      tty.reset().clear().moveTo([0, 0]);
      return run();
    }

    tty.moveTo([proxies.length + 1, 0]);
    console.log('============ DONE! ============');
    clearInterval(interval);
  } else {
    // console.log('not done');
  }
}, 5 * 1000);
