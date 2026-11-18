#!/usr/bin/env node
// Serverni ishga tushiruvchi nazoratchi: server "qayta ishga tushirish" so'rasa (chiqish kodi 75 — masalan, zaxiradan
// tiklangandan keyin) yoki kutilmaganda yiqilsa — 2 soniyadan keyin qayta ishga tushiradi. Ctrl+C — to'xtatadi.
const { spawn } = require('child_process');
const path = require('path');

let child = null, stopping = false;
function start() {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (stopping) return process.exit(0);
    if (code === 0 && !signal) return process.exit(0);     // oddiy to'xtash
    console.log(code === 75 ? '[nazoratchi] server qayta ishga tushirilmoqda...' : `[nazoratchi] server to'xtadi (${signal || code}), 2 soniyadan keyin qayta ishga tushiriladi`);
    setTimeout(start, code === 75 ? 300 : 2000);
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; if (child) child.kill(sig); else process.exit(0); });
start();
