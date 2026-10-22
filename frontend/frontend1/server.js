import { createServer } from 'node:http';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';

const scrypt = promisify(scryptCallback);
const PORT = Number(process.env.API_PORT || 5000);
const DATA_FILE = resolve('.local-data/expense-sharing.json');
const sessions = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const accountNamePattern = /^\p{L}+(?: \p{L}+)*$/u;

async function readStore() {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { users: [], groups: [] };
  }
}

async function writeStore(store) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body is too large.');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, userId);
  return token;
}

function getSessionUserId(request) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return sessions.get(token) || null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function authenticate(request, response) {
  const userId = getSessionUserId(request);
  if (!userId) {
    send(response, 401, { message: 'Please sign in to continue.' });
    return null;
  }
  return userId;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

async function handle(request, response) {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const route = `${request.method} ${url.pathname}`;
  const body = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await readBody(request) : {};
  const store = await readStore();

  if (route === 'POST /api/auth/register') {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!accountNamePattern.test(name) || name.length > 80 || !emailPattern.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
      return send(response, 400, { message: 'Enter a name using letters and spaces, a valid email, and a password between 8 and 128 characters.' });
    }
    if (store.users.some((user) => user.email === email)) {
      return send(response, 409, { message: 'An account with that email already exists.' });
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: randomUUID(), name, email, salt, passwordHash };
    store.users.push(user);
    await writeStore(store);
    const token = createSession(user.id);
    return send(response, 201, { token, user: publicUser(user) });
  }

  if (route === 'POST /api/auth/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = store.users.find((item) => item.email === email);
    if (!user || password.length > 128) return send(response, 401, { message: 'Email or password is incorrect.' });
    const attemptedHash = await scrypt(password, user.salt, 64);
    const storedHash = Buffer.from(user.passwordHash, 'hex');
    if (attemptedHash.length !== storedHash.length || !timingSafeEqual(attemptedHash, storedHash)) {
      return send(response, 401, { message: 'Email or password is incorrect.' });
    }
    return send(response, 200, { token: createSession(user.id), user: publicUser(user) });
  }

  const userId = await authenticate(request, response);
  if (!userId) return;

  if (route === 'GET /api/members') {
    const name = String(url.searchParams.get('name') || '').trim().toLowerCase();
    const seen = new Set();
    const members = store.groups
      .filter((group) => group.ownerId === userId)
      .flatMap((group) => group.members)
      .filter((member) => member.name.toLowerCase() === name && !seen.has(member.id) && seen.add(member.id))
      .map(({ id, name: memberName }) => ({ id, name: memberName }));
    return send(response, 200, { members });
  }

  if (route === 'POST /api/groups') {
    const name = String(body.name || '').trim();
    const submittedMembers = Array.isArray(body.members) ? body.members : [];
    if (!name || submittedMembers.length < 2 || submittedMembers.length > 30) {
      return send(response, 400, { message: 'Provide a group name and between 2 and 30 members.' });
    }
    const existingMembers = store.groups.filter((group) => group.ownerId === userId).flatMap((group) => group.members);
    const members = submittedMembers.map((item) => {
      if (item.memberId) return existingMembers.find((member) => member.id === item.memberId);
      const memberName = String(item.name || '').trim().replace(/\s+/g, ' ');
      return memberName ? { id: randomUUID(), name: memberName } : null;
    });
    if (members.some((member) => !member)) return send(response, 400, { message: 'One or more selected members are invalid.' });
    const group = { id: randomUUID(), ownerId: userId, name, members };
    store.groups.push(group);
    await writeStore(store);
    return send(response, 201, { groupId: group.id, members: group.members });
  }

  if (route === 'POST /api/expenses/calculate') {
    const group = store.groups.find((item) => item.id === body.groupId && item.ownerId === userId);
    const totalKobo = Number(body.total);
    const amounts = Array.isArray(body.individualAmounts) ? body.individualAmounts : [];
    if (!group) return send(response, 404, { message: 'Group not found.' });
    if (!Number.isSafeInteger(totalKobo) || totalKobo <= 0 || amounts.length !== group.members.length) {
      return send(response, 400, { message: 'Provide a valid total and one contribution for every group member.' });
    }
    const spentById = new Map(amounts.map((item) => [item.memberId, Number(item.spent)]));
    if (group.members.some((member) => !Number.isSafeInteger(spentById.get(member.id)) || spentById.get(member.id) < 0)) {
      return send(response, 400, { message: 'Each member contribution must be a non-negative whole number of kobo.' });
    }
    const spentValues = group.members.map((member) => spentById.get(member.id));
    if (sum(spentValues) !== totalKobo) return send(response, 400, { message: 'Individual contributions must add up to the total.' });

    const baseShare = Math.floor(totalKobo / group.members.length);
    const remainder = totalKobo % group.members.length;
    const balances = group.members.map((member, index) => {
      const share = baseShare + (index < remainder ? 1 : 0);
      const contributed = spentById.get(member.id);
      return { memberId: member.id, name: member.name, contributed, share, balance: contributed - share };
    });
    const debtors = balances.filter((item) => item.balance < 0).map((item) => ({ ...item, remaining: -item.balance }));
    const creditors = balances.filter((item) => item.balance > 0).map((item) => ({ ...item, remaining: item.balance }));
    const settlements = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amount = Math.min(debtors[debtorIndex].remaining, creditors[creditorIndex].remaining);
      if (amount > 0) settlements.push({ from: debtors[debtorIndex].name, fromId: debtors[debtorIndex].memberId, to: creditors[creditorIndex].name, toId: creditors[creditorIndex].memberId, amount });
      debtors[debtorIndex].remaining -= amount;
      creditors[creditorIndex].remaining -= amount;
      if (debtors[debtorIndex].remaining === 0) debtorIndex++;
      if (creditors[creditorIndex].remaining === 0) creditorIndex++;
    }
    return send(response, 200, { balances, settlements });
  }

  return send(response, 404, { message: 'API route not found.' });
}

createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) send(response, 500, { message: 'The server could not complete the request.' });
    else response.end();
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Expense sharing API listening at http://localhost:${PORT}/api`);
});
