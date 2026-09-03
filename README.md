# 🏛 EduPage Timetable & School API — Presidential School in Namangan

[![Vercel Deployment](https://img.shields.io/badge/Deploy%20with-Vercel-black?logo=vercel)](https://vercel.com/new)
[![Platform](https://img.shields.io/badge/Platform-aSc%20EduPage%209-blue)](https://nampm.edupage.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20External-emerald)](package.json)

A production-ready reverse-engineered **REST & RPC API** and interactive **Web Application** for **[nampm.edupage.org](https://nampm.edupage.org)** (Presidential School in Namangan / *Namangan Prezident Maktabi*, Uzbekistan).

This repository provides everything developers need to build custom student apps, Telegram bots, mobile applications, hallway kiosk displays, or calendar sync tools using the school's live schedule and substitution data.

---

## 📑 Table of Contents

- [🌟 Live Demo & Features](#-live-demo--features)
- [⚡ Quick Start: Deploying to Vercel](#-quick-start-deploying-to-vercel)
- [💻 Local Setup & Development](#-local-setup--development)
- [📡 Complete API Reference for Developers](#-complete-api-reference-for-developers)
  - [1. School Information (`GET /api/info`)](#1-school-information-get-apiinfo)
  - [2. Timetable Versions & Discovery (`GET /api/timetables`)](#2-timetable-versions--discovery-get-apitimetables)
  - [3. Full Relational Timetable Database (`GET /api/timetable/:id`)](#3-full-relational-timetable-database-get-apitimetableid)
  - [4. Daily Teacher Substitution (`GET /api/substitution`)](#4-daily-teacher-substitution-get-apisubstitution)
  - [5. Live Dynamic Daily Schedule (`GET /api/daily`)](#5-live-dynamic-daily-schedule-get-apidaily)
  - [6. Official News & Announcements (`GET /api/news`)](#6-official-news--announcements-get-apinews)
  - [7. Raw EduPage RPC Passthrough (`POST /api/raw-rpc`)](#7-raw-edupage-rpc-passthrough-post-apiraw-rpc)
- [🛠 How to Build Apps with this API](#-how-to-build-apps-with-this-api)
  - [Example A: Telegram Bot (Daily Schedule & Substitution Alerts)](#example-a-telegram-bot-python)
  - [Example B: React / Mobile App Integration](#example-b-javascript--react--react-native)
  - [Example C: Google / Apple Calendar Sync (.ics)](#example-c-calendar-sync-ics)
- [🔬 Underlying EduPage Architecture & Reverse Engineering](#-underlying-edupage-architecture--reverse-engineering)
- [📁 Repository Structure](#-repository-structure)
- [🤝 Contributing & License](#-contributing--license)

---

## 🌟 Live Demo & Features

The included web app provides an 8-tab dashboard connected to the live school APIs:

1. **📅 Interactive Weekly Timetable**: View by **Class** (14 classes), **Teacher** (36 faculty), or **Classroom** (20 rooms, including normalized gymnasium "Sport Zal") with version switcher across 8 terms. Features automatic multi-period spanning (`colSpan = 2`) for Grade 10 & 11 elective block lessons (A10, B10, A11, B11) with zero schedule gaps. Real-time timeline indicator, live Tashkent clock (UTC+5), and interactive lesson inspector modal with accurate period timings.
2. **⚡ Live Substitution Viewer**: Daily teacher substitutions with date picker and "By Classes" or "By Teachers" view.
3. **🏛 Master Directory**: Filterable cards for all 36 teachers, 14 classes, 20 classrooms (with occupancy % metrics and Sport Zal gymnasium), 32 organized and deduplicated subjects (categorized across 5 academic departments with period counts, assigned faculty, and cohort distributions), and 7 bell periods.
4. **🕒 Dynamic Daily Schedule**: Dated daily overrides via `curentttGetData`.
5. **📰 Official News Feed**: Real-time RSS 2.0 parser.
6. **🔐 Portal Login Simulation**: Mirroring EduPage credentials, Google Workspace, and Microsoft 365 SSO.
7. **🧪 Interactive API Playground**: Built-in Swagger/Postman console with preloaded presets, response latency indicators, and live cURL generator.
8. **📖 Reverse-Engineering Specs**: Full protocol documentation.

---

## ⚡ Quick Start: Deploying to Vercel

You can deploy this entire repository (both the web app frontend and the serverless API proxy) to **Vercel** in under 1 minute for free.

### Method 1: Deploy with Vercel Web Dashboard (Recommended)

1. Fork or push this repository to your GitHub account:
   ```bash
   git remote add origin https://github.com/BilolbekYoldoshxojayev/schoolTimeTable.git
   git push -u origin main
   ```
2. Go to **[vercel.com](https://vercel.com)** and log in.
3. Click **"Add New..." → "Project"**.
4. Select your **`schoolTimeTable`** repository from the list and click **"Import"**.
5. Leave all settings at their defaults:
   - **Framework Preset:** `Other`
   - **Root Directory:** `./`
   - **Build Command:** *(Leave empty)*
   - **Output Directory:** *(Leave empty)*
   - **Environment Variables:** *(None required)*
6. Click **"Deploy"**.

Within 30 seconds, Vercel will give you a live production URL:
👉 `https://your-project.vercel.app`

- Your web client is live at: `https://your-project.vercel.app/`
- Your API endpoints are live at: `https://your-project.vercel.app/api/...`

---

### Method 2: Deploy using Vercel CLI

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to your account
vercel login

# 3. Deploy to production
vercel --prod
```

### How Vercel Routes This Project

- **`public/` folder**: Vercel automatically hosts `public/` files at root (`/`, `/app.js`, `/style.css`, `/logo.png`, `/snapshot-13.json`).
- **`vercel.json`**: Rewrites all `/api/*` requests to `/api/index.js` (which runs `handleRequest` as a Node.js serverless function).

---

## 💻 Local Setup & Development

The repository contains **two complete alternative backends**, each having **zero external dependencies** (uses only standard libraries).

### Option 1: Using Node.js (Recommended)

Requires Node.js (v18 or newer):

```bash
node server.js
```

Open: **`http://localhost:3333`**

### Option 2: Using Python 3

Requires Python 3.8+:

```bash
python server.py
```

Open: **`http://localhost:3333`**

### Option 3: Offline / Static Mode (No Server Needed)

Double-click `public/index.html` in your browser. An offline database snapshot (`public/snapshot-13.json`) is bundled to ensure full functionality even without a running server or internet connection.

---

## 📡 Complete API Reference for Developers

All endpoints return standard JSON responses with CORS headers enabled (`Access-Control-Allow-Origin: *`).

### Base URL
- **Local:** `http://localhost:3333`
- **Vercel:** `https://your-project.vercel.app`
- **Official Host:** `https://nampm.edupage.org`

---

### 1. School Information (`GET /api/info`)

Returns basic metadata, institution branding, timezone, and turnover specifications.

#### Request
```http
GET /api/info
```

#### cURL
```bash
curl "http://localhost:3333/api/info"
```

#### Response Example
```json
{
  "institution": "Presidential School in Namangan",
  "domain": "nampm.edupage.org",
  "location": "Islom Karimov Street, Namangan, Uzbekistan",
  "timezone": "Asia/Tashkent",
  "academicYear": "2026-2027",
  "country": "uz",
  "status": "online"
}
```

---

### 2. Timetable Versions & Discovery (`GET /api/timetables`)

Discovers all published academic terms and semester editions, including which version is currently active (`default_num`).

#### Request
```http
GET /api/timetables
```

#### cURL
```bash
curl "http://localhost:3333/api/timetables"
```

#### Response Example
```json
{
  "default_num": "13",
  "timetables": [
    {
      "tt_num": "13",
      "year": 2026,
      "text": "2026-27 semester-1 (2/9/2026 - 18/6/2027)",
      "datefrom": "2026-09-02",
      "hidden": false
    },
    {
      "tt_num": "11",
      "year": 2025,
      "text": "2025-26 Term II (10/11/2025 - 19/6/2026)",
      "datefrom": "2025-11-10",
      "hidden": true
    }
  ]
}
```

---

### 3. Full Relational Timetable Database (`GET /api/timetable/:id`)

Fetches and parses the relational timetable database for a specific timetable edition (defaults to `13`). Includes classes, faculty, classrooms, bell periods, and pre-built weekly schedule grids.

#### Request
```http
GET /api/timetable/13
```

#### cURL
```bash
curl "http://localhost:3333/api/timetable/13"
```

#### Response Structure
```json
{
  "school": {
    "name": "Presidential School in Namangan, Islom Karimov Street",
    "timezone": "Asia/Tashkent",
    "year": 2026
  },
  "classes": [
    {
      "id": "-17",
      "name": "5-Blue",
      "short": "5-Blue",
      "color": "#0046FF",
      "homeroomTeacherName": "Mr. Nozim",
      "weeklyLessons": 31
    }
  ],
  "teachers": [
    {
      "id": "-13",
      "name": "Ms. Oydina",
      "short": "Ms. Oydina",
      "color": "#FF0000",
      "homeroomClass": "7-Blue",
      "weeklyLessons": 24,
      "subjects": ["Native language", "Uzbek literature"]
    }
  ],
  "classrooms": [
    {
      "id": "-1",
      "name": "101",
      "short": "101",
      "bookedSlots": 27,
      "utilizationRate": 77
    }
  ],
  "periods": [
    { "id": "1", "name": "1", "startTime": "08:30", "endTime": "09:15" },
    { "id": "2", "name": "2", "startTime": "09:20", "endTime": "10:05" },
    { "id": "3", "name": "3", "startTime": "10:10", "endTime": "10:55" },
    { "id": "4", "name": "4", "startTime": "11:25", "endTime": "12:10" },
    { "id": "5", "name": "5", "startTime": "12:15", "endTime": "13:00" },
    { "id": "6", "name": "6", "startTime": "14:00", "endTime": "14:45" },
    { "id": "7", "name": "7", "startTime": "14:50", "endTime": "15:35" }
  ],
  "classGrid": {
    "-17": {
      "0": {
        "1": [
          {
            "cardId": "*1",
            "period": "1",
            "dayIndex": 0,
            "subject": { "name": "Mathematics", "color": "#FFCC00" },
            "teachers": [{ "name": "Mr. Jonathan" }],
            "classrooms": [{ "name": "101" }]
          }
        ]
      }
    }
  },
  "teacherGrid": { ... },
  "classroomGrid": { ... }
}
```

---

### 4. Daily Teacher Substitution (`GET /api/substitution`)

Proxies EduPage's substitution engine (`getSubstViewerDayDataHtml`) to check covering teachers, cancellations, and classroom reassignments for any given date.

#### Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `date` | String | No | Today (`YYYY-MM-DD`) | Date to check substitutions for |
| `mode` | String | No | `classes` | Grouping mode: `classes` or `teachers` |

#### Request
```http
GET /api/substitution?date=2026-09-02&mode=classes
```

#### cURL
```bash
curl "http://localhost:3333/api/substitution?date=2026-09-02&mode=classes"
```

#### Response Example
```json
{
  "date": "2026-09-02",
  "mode": "classes",
  "html": "<div class=\"section\">...There is no substitution defined for this day...</div>",
  "hasSubstitution": false
}
```

---

### 5. Live Dynamic Daily Schedule (`GET /api/daily`)

Queries the school's live daily schedule RPC (`curentttGetData`) for any specific class and date.

#### Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `classId` | String | No | `-17` (`5-Blue`) | Target class ID (e.g. `-17`, `-18`, `-15`, etc.) |
| `date` | String | No | Today | Target date (`YYYY-MM-DD`) |

#### Request
```http
GET /api/daily?classId=-17&date=2026-09-02
```

#### cURL
```bash
curl "http://localhost:3333/api/daily?classId=-17&date=2026-09-02"
```

---

### 6. Official News & Announcements (`GET /api/news`)

Fetches and parses the school's live RSS 2.0 XML feed into structured JSON.

#### Request
```http
GET /api/news
```

#### cURL
```bash
curl "http://localhost:3333/api/news"
```

#### Response Example
```json
{
  "channelTitle": "Presidential School in Namangan",
  "items": [
    {
      "title": "Timetable",
      "link": "https://nampm.edupage.org/news/?newid=3#news-3",
      "pubDate": "Sat, 31 Aug 2024 17:24:44 GMT",
      "description": "View or print your current timetable. The latest timetable was published on: 1/9/2026"
    }
  ]
}
```

---

### 7. Raw EduPage RPC Passthrough (`POST /api/raw-rpc`)

Send any arbitrary EduPage RPC method directly to `nampm.edupage.org` through the backend proxy.

#### Request
```http
POST /api/raw-rpc
Content-Type: application/json

{
  "endpoint": "/timetable/server/ttviewer.js?__func=getTTViewerData",
  "args": [null, 2026]
}
```

#### cURL
```bash
curl -X POST "http://localhost:3333/api/raw-rpc" \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"/timetable/server/ttviewer.js?__func=getTTViewerData","args":[null,2026]}'
```

---

## 🛠 How to Build Apps with this API

### Example A: Telegram Bot (Python)

Send daily timetable alerts and substitution notifications:

```python
import requests
from datetime import date

API_BASE = "https://your-project.vercel.app/api"

def get_class_schedule(class_name="5-Blue"):
    # 1. Fetch full database
    res = requests.get(f"{API_BASE}/timetable/13").json()
    
    # 2. Find target class
    target_class = next((c for c in res["classes"] if c["name"] == class_name), None)
    if not target_class:
        return f"Class {class_name} not found."
    
    # 3. Get today's day of week (0=Mon .. 4=Fri)
    day_idx = date.today().weekday()
    if day_idx > 4:
        return "Weekend! No school scheduled."

    grid = res["classGrid"].get(target_class["id"], {}).get(str(day_idx), {})
    
    lines = [f"📅 Schedule for {class_name} today:"]
    for period in range(1, 8):
        lessons = grid.get(str(period), [])
        if lessons:
            subj = lessons[0]["subject"]["name"]
            room = lessons[0]["classrooms"][0]["name"] if lessons[0]["classrooms"] else "TBD"
            teacher = lessons[0]["teachers"][0]["short"] if lessons[0]["teachers"] else ""
            lines.append(f"Period {period}: {subj} ({room}) — {teacher}")
        else:
            lines.append(f"Period {period}: Free")
            
    return "\n".join(lines)

print(get_class_schedule("5-Blue"))
```

---

### Example B: JavaScript / React / React Native

Integrate into a mobile app or frontend dashboard:

```javascript
// Fetch substitution status
async function checkSubstitution() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`https://your-project.vercel.app/api/substitution?date=${today}&mode=classes`);
  const data = await res.json();
  
  if (data.hasSubstitution) {
    console.log("⚠️ Substitutions reported for today!");
  } else {
    console.log("✓ Normal schedule (No substitutions).");
  }
}

// Fetch all teachers
async function getTeachers() {
  const res = await fetch(`https://your-project.vercel.app/api/timetable/13`);
  const data = await res.json();
  return data.teachers.map(t => ({
    name: t.name,
    workload: t.weeklyLessons,
    homeroom: t.homeroomClass
  }));
}
```

---

### Example C: Calendar Sync (.ics)

Convert any class weekly schedule into a standard `.ics` file for Google Calendar, Apple Calendar, or Outlook:

```javascript
function generateIcs(className, classLessons, periods) {
  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Presidential School Namangan//Timetable//EN"
  ];
  
  // Create recurring weekly VEVENTs for each scheduled card
  // ...
  ics.push("END:VCALENDAR");
  return ics.join("\r\n");
}
```

---

## 🔬 Underlying EduPage Architecture & Reverse Engineering

### Direct Querying to EduPage (Without Proxy)

If querying `nampm.edupage.org` directly from server-side code:

```http
POST https://nampm.edupage.org/timetable/server/regulartt.js?__func=regularttGetData
Content-Type: application/json; charset=utf-8
Referer: https://nampm.edupage.org/timetable/

{
  "__args": [null, "13"],
  "__gsh": "00000000",
  "__client_redirect": null
}
```

- **`__args`**: Context array. First element is always `null`.
- **`__gsh`**: Guest security hash (`"00000000"` for anonymous read-only access).
- **Day Bitmasks**: EduPage stores days as 5-character bitmasks (`10000` = Mon, `01000` = Tue, `00100` = Wed, `00010` = Thu, `00001` = Fri).
- **Multi-Period Lessons (`durationperiods`)**: Elective block subjects in grades 10 & 11 (**A10**, **B10**, **A11**, **B11**) specify `durationperiods: 2`. The scheduler places the lesson starting at `card.period` and spans it across `durationperiods` consecutive periods, eliminating schedule gaps and ensuring 100% accurate faculty workloads and classroom bookings.
- **Room Name Normalization (`Sport Zal`)**: Raw EduPage abbreviation `S-zal` is mapped to canonical `Sport Zal` across the room directory, filter dropdowns, timetable blocks, and inspector modals.
- **Curriculum Subject Deduplication & Organization**: Consolidates 39 raw EduPage subject entries (including multiple split records for `Science` and trailing-dot variants like `Mathematics.`) into 32 unified academic disciplines. Groups them into 5 academic departments (STEM & Computing, Languages & Literature, Social Sciences & Humanities, Arts, Sports & Technology, and Specialized & Form Time) with aggregated lesson periods and faculty assignments.

---

## 📁 Repository Structure

```text
schoolTimeTable/
├── api/
│   └── index.js           # Vercel Serverless Function entry point
├── public/
│   ├── index.html         # 8-tab responsive web application
│   ├── app.js             # Frontend controller & UI logic
│   ├── style.css          # Glassmorphic styles, print CSS, report styles
│   ├── logo.png           # Official school crest logo
│   ├── favicon.ico        # Official EduPage favicon
│   ├── rss.png            # Official RSS badge icon
│   └── snapshot-13.json   # Full offline database snapshot
├── server.js              # Standalone Node.js server & proxy (zero npm dependencies)
├── server.py              # Standalone Python 3 server & proxy (zero pip dependencies)
├── vercel.json            # Vercel routing and serverless configuration
├── package.json           # Node.js project manifest
├── .gitignore             # Git ignore rules
└── README.md              # Complete developer & API documentation
```

---

## 🤝 Contributing & License

Contributions, issue reports, and pull requests are welcome!

Released under the **[MIT License](LICENSE)**. Created for educational and community development purposes supporting the **Presidential School in Namangan** community.
