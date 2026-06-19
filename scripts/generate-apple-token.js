#!/usr/bin/env node
// Genera un nuovo Apple Music developer token (JWT, valido 6 mesi).
// Uso: node scripts/generate-apple-token.js
// Poi copia il token in .env.local come APPLE_MUSIC_DEVELOPER_TOKEN.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const teamId = process.env.APPLE_MUSIC_TEAM_ID;
const keyId = process.env.APPLE_MUSIC_KEY_ID;
const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!teamId || !keyId || !privateKey) {
  console.error('Mancano APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID o APPLE_MUSIC_PRIVATE_KEY in .env.local');
  process.exit(1);
}

const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // ~6 mesi
const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now, exp })).toString('base64url');

const toSign = `${header}.${payload}`;
const sign = crypto.createSign('SHA256');
sign.update(toSign);
const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');

const token = `${toSign}.${sig}`;
const expDate = new Date(exp * 1000).toLocaleDateString('it-IT');

console.log('\n✅ Nuovo developer token generato (scade il ' + expDate + '):\n');
console.log(token);
console.log('\nCopia il token qui sopra e aggiorna APPLE_MUSIC_DEVELOPER_TOKEN in .env.local\n');
