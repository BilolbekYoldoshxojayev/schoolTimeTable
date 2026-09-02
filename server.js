/**
 * EduPage API Proxy & Demo Server for nampm.edupage.org
 * Presidential School in Namangan
 * 
 * Zero external dependencies (uses Node.js built-in http, https, fs, path, url).
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3333;
const EDUPAGE_HOST = 'nampm.edupage.org';
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory cache for API responses (5-minute TTL)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const item = cache.get(key);
  if (item && (Date.now() - item.time < CACHE_TTL_MS)) {
    return item.data;
  }
  return null;
}

function setCached(key, data) {
  cache.set(key, { time: Date.now(), data });
}

/**
 * Perform EduPage RPC call
 */
function edupageRpc(endpointPath, args = []) {
  return new Promise((resolve, reject) => {
    const postPayload = JSON.stringify({
      __args: args,
      __gsh: '00000000',
      __client_redirect: null
    });

    const options = {
      hostname: EDUPAGE_HOST,
      path: endpointPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://${EDUPAGE_HOST}/timetable/`,
        'Content-Length': Buffer.byteLength(postPayload)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${body.slice(0, 200)}...`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('EduPage request timed out'));
    });

    req.write(postPayload);
    req.end();
  });
}

/**
 * Fetch text (e.g. RSS news)
 */
function edupageGet(pathStr) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: EDUPAGE_HOST,
      path: pathStr,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': `https://${EDUPAGE_HOST}/`
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

/**
 * Parse XML RSS feed items using regex (to stay zero-dependency)
 */
function parseRssXml(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>|<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i);

    items.push({
      title: (titleMatch ? (titleMatch[1] || titleMatch[2]) : '').trim(),
      link: (linkMatch ? (linkMatch[1] || linkMatch[2]) : '').trim(),
      pubDate: (pubDateMatch ? pubDateMatch[1] : '').trim(),
      description: (descMatch ? (descMatch[1] || descMatch[2]) : '').trim()
    });
  }

  const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/i);
  return {
    channelTitle: channelTitleMatch ? channelTitleMatch[1].trim() : 'Presidential School in Namangan',
    items
  };
}

/**
 * Transform raw EduPage dbiAccessorRes relational tables into structured models
 */
function transformTimetableData(rawDbi) {
  const tables = {};
  for (const t of (rawDbi.tables || [])) {
    tables[t.id] = t.data_rows || [];
  }

  // Lookup dictionaries
  const classesMap = {};
  const teachersMap = {};
  const subjectsMap = {};
  const classroomsMap = {};
  const periodsMap = {};
  const daysMap = {};
  const lessonsMap = {};

  (tables.classes || []).forEach(c => { classesMap[c.id] = c; });
  (tables.teachers || []).forEach(t => { teachersMap[t.id] = t; });
  (tables.subjects || []).forEach(s => { subjectsMap[s.id] = s; });
  (tables.classrooms || []).forEach(r => { classroomsMap[r.id] = r; });
  (tables.periods || []).forEach(p => { periodsMap[p.period || p.id] = p; });
  (tables.days || []).forEach(d => { daysMap[d.id] = d; });
  (tables.lessons || []).forEach(l => { lessonsMap[l.id] = l; });

  const globalInfo = (tables.globals && tables.globals[0]) || {};

  // Build grid mappings
  // classGrid: classId -> dayIndex (0..4) -> periodIndex (1..7) -> [items]
  const classGrid = {};
  // teacherGrid: teacherId -> dayIndex (0..4) -> periodIndex (1..7) -> [items]
  const teacherGrid = {};
  // classroomGrid: classroomId -> dayIndex (0..4) -> periodIndex (1..7) -> [items]
  const classroomGrid = {};

  // Track metrics
  const teacherWorkload = {}; // teacherId -> Set of cardIds or count
  const classroomBookings = {}; // classroomId -> Set of `${dayIdx}_${period}`
  const classLessonsCount = {}; // classId -> count
  const subjectTotalLessons = {}; // subjectId -> count
  const teacherSubjects = {}; // teacherId -> Set of subject names
  const teacherClasses = {}; // teacherId -> Set of class names

  const cards = tables.cards || [];

  for (const card of cards) {
    const lesson = lessonsMap[card.lessonid];
    if (!lesson) continue;

    const period = card.period;
    const daysMask = card.days || ''; // e.g. "10000" for Monday, "01000" for Tuesday
    const assignedRooms = (card.classroomids || []).map(rid => classroomsMap[rid]).filter(Boolean);
    const assignedTeachers = (lesson.teacherids || []).map(tid => teachersMap[tid]).filter(Boolean);
    const assignedClasses = (lesson.classids || []).map(cid => classesMap[cid]).filter(Boolean);
    const subject = subjectsMap[lesson.subjectid] || { name: 'Unknown', short: 'UNK', color: '#999999' };

    // Find active days from bitmask
    for (let dayIdx = 0; dayIdx < daysMask.length; dayIdx++) {
      if (daysMask[dayIdx] === '1') {
        const item = {
          cardId: card.id,
          lessonId: lesson.id,
          period: period,
          dayIndex: dayIdx,
          subject: {
            id: subject.id,
            name: subject.name,
            short: subject.short,
            color: subject.color || '#3b82f6'
          },
          teachers: assignedTeachers.map(t => ({
            id: t.id,
            name: t.name || t.short,
            short: t.short,
            color: t.color
          })),
          classes: assignedClasses.map(c => ({
            id: c.id,
            name: c.name,
            short: c.short,
            color: c.color
          })),
          classrooms: assignedRooms.map(r => ({
            id: r.id,
            name: r.name,
            short: r.short,
            color: r.color
          }))
        };

        // Populate classGrid
        for (const c of assignedClasses) {
          if (!classGrid[c.id]) classGrid[c.id] = {};
          if (!classGrid[c.id][dayIdx]) classGrid[c.id][dayIdx] = {};
          if (!classGrid[c.id][dayIdx][period]) classGrid[c.id][dayIdx][period] = [];
          classGrid[c.id][dayIdx][period].push(item);
          classLessonsCount[c.id] = (classLessonsCount[c.id] || 0) + 1;
        }

        // Populate teacherGrid
        for (const t of assignedTeachers) {
          if (!teacherGrid[t.id]) teacherGrid[t.id] = {};
          if (!teacherGrid[t.id][dayIdx]) teacherGrid[t.id][dayIdx] = {};
          if (!teacherGrid[t.id][dayIdx][period]) teacherGrid[t.id][dayIdx][period] = [];
          teacherGrid[t.id][dayIdx][period].push(item);

          teacherWorkload[t.id] = (teacherWorkload[t.id] || 0) + 1;
          if (!teacherSubjects[t.id]) teacherSubjects[t.id] = new Set();
          teacherSubjects[t.id].add(subject.name);
          if (!teacherClasses[t.id]) teacherClasses[t.id] = new Set();
          assignedClasses.forEach(c => teacherClasses[t.id].add(c.name));
        }

        // Populate classroomGrid
        for (const r of assignedRooms) {
          if (!classroomGrid[r.id]) classroomGrid[r.id] = {};
          if (!classroomGrid[r.id][dayIdx]) classroomGrid[r.id][dayIdx] = {};
          if (!classroomGrid[r.id][dayIdx][period]) classroomGrid[r.id][dayIdx][period] = [];
          classroomGrid[r.id][dayIdx][period].push(item);

          if (!classroomBookings[r.id]) classroomBookings[r.id] = new Set();
          classroomBookings[r.id].add(`${dayIdx}_${period}`);
        }

        subjectTotalLessons[subject.id] = (subjectTotalLessons[subject.id] || 0) + 1;
      }
    }
  }

  // Find homeroom assignments
  const homeroomMap = {};
  (tables.classes || []).forEach(c => {
    if (c.teacherid) {
      homeroomMap[c.teacherid] = c.name;
    }
  });

  return {
    school: {
      name: globalInfo.reg_name || 'Presidential School in Namangan, Islom Karimov Street',
      address: 'Islom Karimov Street, Namangan, Uzbekistan',
      year: globalInfo.edupage_year || 2026,
      timezone: 'Asia/Tashkent',
      country: 'uz',
      platform: 'aSc EduPage 9'
    },
    days: (tables.days || []).map(d => ({ id: d.id, name: d.name, short: d.short })),
    periods: (tables.periods || []).map(p => ({
      id: p.period || p.id,
      name: p.name,
      startTime: p.starttime,
      endTime: p.endtime
    })),
    classes: (tables.classes || []).map(c => {
      const hrTeacher = teachersMap[c.teacherid];
      return {
        id: c.id,
        name: c.name,
        short: c.short,
        color: c.color,
        teacherId: c.teacherid,
        homeroomTeacherName: hrTeacher ? (hrTeacher.name || hrTeacher.short) : 'Unassigned',
        weeklyLessons: classLessonsCount[c.id] || 0
      };
    }),
    teachers: (tables.teachers || []).map(t => ({
      id: t.id,
      name: t.name || t.short,
      short: t.short,
      color: t.color,
      homeroomClass: homeroomMap[t.id] || null,
      weeklyLessons: teacherWorkload[t.id] || 0,
      subjects: Array.from(teacherSubjects[t.id] || []),
      classes: Array.from(teacherClasses[t.id] || [])
    })),
    subjects: (tables.subjects || []).map(s => ({
      id: s.id,
      name: s.name,
      short: s.short,
      color: s.color,
      totalLessons: subjectTotalLessons[s.id] || 0
    })),
    classrooms: (tables.classrooms || []).map(r => {
      const bookedSlots = (classroomBookings[r.id] || new Set()).size;
      const totalPossibleSlots = 5 * 7; // 35 slots/week
      const utilizationRate = Math.round((bookedSlots / totalPossibleSlots) * 100);
      return {
        id: r.id,
        name: r.name,
        short: r.short,
        color: r.color || '#e2e8f0',
        bookedSlots,
        utilizationRate
      };
    }),
    classGrid,
    teacherGrid,
    classroomGrid,
    stats: {
      totalClasses: (tables.classes || []).length,
      totalTeachers: (tables.teachers || []).length,
      totalSubjects: (tables.subjects || []).length,
      totalClassrooms: (tables.classrooms || []).length,
      totalLessons: (tables.lessons || []).length,
      totalCards: (tables.cards || []).length
    }
  };
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function handleRequest(req, res) {
  // Add CORS headers for developer convenience
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API Routes
  if (pathname.startsWith('/api/')) {
    try {
      if (pathname === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          institution: 'Presidential School in Namangan',
          domain: EDUPAGE_HOST,
          location: 'Islom Karimov Street, Namangan, Uzbekistan',
          timezone: 'Asia/Tashkent',
          academicYear: '2026-2027',
          country: 'uz',
          apiEndpoints: {
            timetableDiscovery: 'POST /timetable/server/ttviewer.js?__func=getTTViewerData',
            fullTimetable: 'POST /timetable/server/regulartt.js?__func=regularttGetData',
            dailySchedule: 'POST /timetable/server/currenttt.js?__func=curentttGetData',
            newsFeed: 'GET /rss/news'
          },
          status: 'online'
        }));
        return;
      }

      if (pathname === '/api/timetables') {
        const cacheKey = 'timetables_list';
        let data = getCached(cacheKey);
        if (!data) {
          const rpcRes = await edupageRpc('/timetable/server/ttviewer.js?__func=getTTViewerData', [null, 2026]);
          data = rpcRes.r?.regular || { timetables: [] };
          setCached(cacheKey, data);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      if (pathname.startsWith('/api/timetable/')) {
        const ttNum = pathname.replace('/api/timetable/', '') || '13';
        const cacheKey = `timetable_${ttNum}`;
        let transformed = getCached(cacheKey);

        if (!transformed) {
          const rpcRes = await edupageRpc('/timetable/server/regulartt.js?__func=regularttGetData', [null, ttNum]);
          const dbi = rpcRes.r?.dbiAccessorRes;
          if (!dbi) {
            throw new Error('No timetable database returned by EduPage for tt_num: ' + ttNum);
          }
          transformed = transformTimetableData(dbi);
          setCached(cacheKey, transformed);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(transformed));
        return;
      }

      if (pathname === '/api/daily') {
        const classId = parsedUrl.query.classId || '-17';
        const dateStr = parsedUrl.query.date || new Date().toISOString().slice(0, 10);
        const year = parseInt(dateStr.slice(0, 4), 10) || 2026;

        const args = [
          null,
          {
            year: year,
            datefrom: dateStr,
            dateto: dateStr,
            table: 'classes',
            id: classId,
            showColors: true,
            showIgroupsInClasses: true,
            showOrig: true
          }
        ];

        const rpcRes = await edupageRpc('/timetable/server/currenttt.js?__func=curentttGetData', args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rpcRes.r || { ttitems: [] }));
        return;
      }

      if (pathname === '/api/substitution') {
        const dateStr = parsedUrl.query.date || new Date().toISOString().slice(0, 10);
        const mode = parsedUrl.query.mode || 'classes'; // 'classes' or 'teachers'
        const cacheKey = `subst_${dateStr}_${mode}`;
        let cached = getCached(cacheKey);

        if (!cached) {
          const rpcRes = await edupageRpc(
            '/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml',
            [null, { date: dateStr, mode: mode, kiosk: null }]
          );
          const htmlContent = rpcRes.r || '';
          cached = {
            date: dateStr,
            mode: mode,
            html: htmlContent,
            hasSubstitution: !htmlContent.includes('nosubst') && htmlContent.length > 50
          };
          setCached(cacheKey, cached);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cached));
        return;
      }

      if (pathname === '/api/news') {
        const cacheKey = 'rss_news';
        let newsData = getCached(cacheKey);
        if (!newsData) {
          const xml = await edupageGet('/rss/news');
          newsData = parseRssXml(xml);
          setCached(cacheKey, newsData);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newsData));
        return;
      }

      if (pathname === '/api/raw-rpc' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const reqBody = JSON.parse(body);
            const endpoint = reqBody.endpoint || '/timetable/server/ttviewer.js?__func=getTTViewerData';
            const args = reqBody.args || [null, 2026];
            const startTime = Date.now();
            const rpcRes = await edupageRpc(endpoint, args);
            const latencyMs = Date.now() - startTime;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ latencyMs, response: rpcRes }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
      return;
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: apiErr.message }));
      return;
    }
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for client-side navigation
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(handleRequest);

function startServer(port = DEFAULT_PORT) {
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 EduPage Explorer Server for nampm.edupage.org`);
    console.log(`🏛  Presidential School in Namangan`);
    console.log(`🌐 Web App running at: http://localhost:${port}`);
    console.log(`📡 API Endpoints available under http://localhost:${port}/api/`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  handleRequest,
  edupageRpc,
  edupageGet,
  transformTimetableData,
  parseRssXml,
  startServer
};

