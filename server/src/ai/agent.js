/**
 * SIH26028 — AI Assistant 2.0: Railway Agent (Architecture v3)
 *
 * ARCHITECTURE:
 *   1. Extract deterministic entities (train numbers, PNRs, station codes) cheaply.
 *   2. Classify intent into: public_train | private_user | general | unknown.
 *   3. For PUBLIC_TRAIN with an explicit train number → execute tools DIRECTLY,
 *      skip LLM tool-calling loop. One LLM call only (synthesis).
 *   4. For all other requests → LLM with tools (native tool calling).
 *   5. LLM synthesizes answer from REAL tool data only.
 *   6. Web search is a TOOL the LLM can choose to call; never auto-prefetched.
 *   7. Independent tools execute in PARALLEL.
 *   8. Follow-up context is injected into system prompt from history.
 *
 * RULES:
 *   - NEVER invent train numbers, schedules, fares, delays, ETA, bookings.
 *   - If data is unavailable, say so specifically (not "train not found").
 *   - Conversation history window: 12 messages.
 */

const { callAI, AIProviderError, getProviderStatus, getWebSearchAvailable } = require('./provider');
const { runFallbackAgent } = require('./fallbackAgent');
const tools = require('./railwayTools');
const { searchWeb } = require('./webSearch');
const { getAISystemDateTime } = require('../utils/istTime');

// ============================================================
// ENTITY EXTRACTION — cheap, deterministic, no LLM needed
// ============================================================

function extractTrainNumber(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function extractTravelClass(text) {
  if (!text) return null;
  const m = text.toUpperCase().match(/\b(1A|2A|3A|AC2|CC|SL|2S|EC)\b/);
  return m ? m[1] : null;
}

function extractPassengerCount(text) {
  if (!text) return 1;
  const patterns = [
    /\b(\d+)\s*(?:passengers?|adults?|people|tickets?|travellers?)\b/i,
    /\bfor\s+(\d+)\s*(?:passengers?|adults?|people)?\b/i,
    /\b(\d+)\s+passenger/i,
    /passenger[s]?\s*[:=]?\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const count = parseInt(m[1], 10);
      if (count > 0 && count <= 50) return count;
    }
  }
  return 1;
}

function extractPNR(text) {
  if (!text) return null;
  const withLabel = text.match(/(?:pnr|booking)\s+(?:status\s+)?([A-Z0-9]{5,12})/i);
  if (withLabel) return withLabel[1].toUpperCase();
  const bare = text.match(/\b([A-Z]{2,3}\d{5,10}|\d{10})\b/i);
  return bare ? bare[1].toUpperCase() : null;
}

/**
 * Extract train context from the last N messages of conversation history.
 * Returns { trainNumber, trainName } if found in recent turns.
 */
function extractContextFromHistory(history = []) {
  const recentMessages = history.slice(-6); // look at last 6 turns
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (!msg?.content) continue;
    const num = extractTrainNumber(msg.content);
    if (num) return { trainNumber: num };
    // Look for "train named X" or "Konark Express" type references
    const nameMatch = msg.content.match(/\b(\w+\s+(?:express|rajdhani|shatabdi|duronto|mail|superfast|intercity))\b/i);
    if (nameMatch) return { trainName: nameMatch[1].trim() };
  }
  return {};
}

// ============================================================
// INTENT CLASSIFICATION — determines routing strategy
// ============================================================

const INTENT = {
  PUBLIC_TRAIN_STATUS:   'public_train_status',    // "where is train 11020"
  PUBLIC_TRAIN_ETA:      'public_train_eta',        // "ETA of train 11020"
  PUBLIC_TRAIN_INFO:     'public_train_info',       // "tell me about train 11020"
  PUBLIC_TRAIN_FARE:     'public_train_fare',       // "fare of train 11020"
  PUBLIC_TRAIN_SEARCH:   'public_train_search',     // "trains from Bangalore to Delhi"
  PUBLIC_EVENTS:         'public_events',           // "any delays/disruptions?"
  PUBLIC_STATION:        'public_station',          // "station info for NDLS"
  PUBLIC_WEATHER:        'public_weather',          // "weather in Bangalore"
  PRIVATE_MY_TRAIN:      'private_my_train',        // "where is MY train"
  PRIVATE_MY_BOOKINGS:   'private_my_bookings',     // "show my bookings"
  PRIVATE_MY_PNR:        'private_my_pnr',          // "my PNR"
  PRIVATE_MY_WALLET:     'private_my_wallet',       // "my wallet balance"
  PRIVATE_MY_JOURNEY:    'private_my_journey',      // "my active journey"
  GENERAL_CHAT:          'general_chat',            // "hello", "what is RAC?"
  LLM_DECIDE:            'llm_decide',              // complex / ambiguous — let LLM reason
};

function classifyIntent(message, history = []) {
  const msg = message.toLowerCase().trim();
  const hasTrainNumber = /\b\d{5}\b/.test(msg);

  // --- PRIVATE (must have "my" or user-ownership cue) ---
  if (/\b(my\s+(?:bookings?|booking history|tickets?|reservations?))\b/.test(msg)
    || /\b(show\s+bookings?|list\s+bookings?|booking\s+history|past\s+bookings?)\b/.test(msg)) {
    return INTENT.PRIVATE_MY_BOOKINGS;
  }
  if (/\b(my\s+(?:pnr|ticket)|check\s+my\s+pnr|pnr\s+status|ticket\s+status)\b/.test(msg)
    || /\bpnr\b.*\b[A-Z0-9]{6,12}\b/i.test(message)) {
    return INTENT.PRIVATE_MY_PNR;
  }
  if (/\b(my\s+wallet|wallet\s+balance|how\s+much\s+in\s+(?:my\s+)?wallet|wallet\s+credit)\b/.test(msg)) {
    return INTENT.PRIVATE_MY_WALLET;
  }

  // "my train" without explicit train number → private journey
  const myTrainWithoutNumber =
    /\b(my\s+train|where\s+is\s+my\s+train|my\s+journey|my\s+active|track\s+my\s+train)\b/.test(msg) &&
    !hasTrainNumber;

  if (myTrainWithoutNumber) {
    if (/\b(eta|when\s+will|arrive|reach|how\s+long|how\s+late)\b/.test(msg)) return INTENT.PRIVATE_MY_JOURNEY;
    if (/\b(status|where|location|current|live|track|delay|late)\b/.test(msg)) return INTENT.PRIVATE_MY_TRAIN;
    return INTENT.PRIVATE_MY_JOURNEY;
  }

  // --- PUBLIC: explicit train number or name present ---
  if (hasTrainNumber || /\b(konark|rajdhani|shatabdi|duronto|garib rath|vande bharat|intercity)\s+(express|mail)?\b/i.test(msg)) {
    if (/\b(fare|price|cost|how\s+much|ticket\s+cost|pricing)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_FARE;
    if (/\b(eta|when\s+will|arrive|reach|how\s+long|how\s+late|predicted\s+arrival)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_ETA;
    if (/\b(status|where\s+is|live|location|current|track|delay|late|running|speed|station)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_STATUS;
    if (/\b(stops?|stations?|route|schedule|timings?|info|details?|tell\s+me\s+about|what\s+is|about)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_INFO;
    // Has train number but unclear context — check history
    const histCtx = extractContextFromHistory(history);
    if (histCtx.trainNumber || histCtx.trainName) return INTENT.PUBLIC_TRAIN_STATUS; // default for follow-ups
    return INTENT.PUBLIC_TRAIN_INFO;
  }

  // Follow-up references like "where is it?", "is it delayed?", "why is it late?"
  const isFollowUp = /\b(it|that\s+train|this\s+train|the\s+train)\b/.test(msg);
  if (isFollowUp && history.length > 0) {
    const histCtx = extractContextFromHistory(history);
    if (histCtx.trainNumber || histCtx.trainName) {
      if (/\b(fare|price|cost|how\s+much)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_FARE;
      if (/\b(eta|arrive|reach|when\s+will)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_ETA;
      if (/\b(stop|station|route|schedule)\b/.test(msg)) return INTENT.PUBLIC_TRAIN_INFO;
      return INTENT.PUBLIC_TRAIN_STATUS; // default follow-up
    }
  }

  // --- PUBLIC: fare without explicit train ---
  if (/\b(fare|price|cost|ticket\s+cost|pricing)\b/.test(msg) && !myTrainWithoutNumber) {
    return INTENT.PUBLIC_TRAIN_FARE;
  }

  // --- PUBLIC: train search ---
  if (/\b(trains?|find|show|list|search|available|running|schedule)\b/.test(msg) &&
      /\b(from|to|between|bangalore|delhi|mumbai|chennai|kolkata|howrah|pune|hyderabad|ahmedabad|sbc|ndls|mas|hwh|bct|cst|lko|sc|adi|pnq)\b/.test(msg)) {
    return INTENT.PUBLIC_TRAIN_SEARCH;
  }

  // --- PUBLIC: station info ---
  if (/\b(station\s+info|station\s+details|about\s+station|info\s+(?:for|about|on)\s+station)\b/.test(msg)) {
    return INTENT.PUBLIC_STATION;
  }

  // --- PUBLIC: weather ---
  if (/\b(weather|forecast|temperature|rain|rainy|sunny|cloudy|storm|humidity|wind)\b/.test(msg)) {
    return INTENT.PUBLIC_WEATHER;
  }

  // --- PUBLIC: delays/events without specific train ---
  if (/\b(delays?|disruptions?|cancell|operational\s+events?|any\s+issues?)\b/.test(msg)) {
    return INTENT.PUBLIC_EVENTS;
  }

  // --- GENERAL CHAT ---
  if (/^(hello|hi|hey|good\s+(morning|evening|afternoon|night)|howdy|greetings|namaste)\b/i.test(msg)) {
    return INTENT.GENERAL_CHAT;
  }
  if (/\b(what\s+(?:is|are)\s+(?:rac|wl|tatkal|pnr|irctc|general|sleeper|ac|confirmed)|how\s+(?:to|do)|explain|meaning\s+of)\b/.test(msg)) {
    return INTENT.GENERAL_CHAT;
  }
  if (/\b(what\s+can\s+you|help\s+me|can\s+you|your\s+capabilities?|what\s+do\s+you\s+do)\b/.test(msg)) {
    return INTENT.GENERAL_CHAT;
  }

  return INTENT.LLM_DECIDE;
}

// ============================================================
// DIRECT TOOL EXECUTION (for deterministic paths)
// ============================================================

/**
 * Run tools in PARALLEL when they are independent.
 * Returns map of { toolName: result }.
 */
async function runParallel(toolList, context) {
  const entries = await Promise.all(
    toolList.map(async ({ name, args }) => {
      const impl = tools[name];
      if (!impl) return [name, { available: false, error: `Unknown tool: ${name}` }];
      try {
        const result = await impl(context, args || {});
        return [name, result];
      } catch (err) {
        console.error(`[Agent] Tool ${name} failed:`, err.message);
        return [name, { available: false, error: err.message }];
      }
    })
  );
  return Object.fromEntries(entries);
}

// ============================================================
// TOOL SCHEMAS — what the LLM can call
// ============================================================

const TOOL_SCHEMAS = [
  {
    name: 'getTrainInfo',
    description: 'Get general information about a train: number, name, schedule, route, stops, days of operation. Use for "tell me about train X", "what stations does X stop at", "what is train X". Works for ANY train — no booking required.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number e.g. 11020, 12951' },
        trainName: { type: 'string', description: 'Train name e.g. "Konark Express"' },
      },
      required: [],
    },
  },
  {
    name: 'searchTrains',
    description: 'Search for trains between two stations. Use source and destination station codes (e.g. SBC, NDLS, MAS). PRIMARY tool for "trains from X to Y" queries.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source station code (e.g. SBC, NDLS, MAS)' },
        destination: { type: 'string', description: 'Destination station code (e.g. BCT, HWH, MAS)' },
        station: { type: 'string', description: 'Find trains at a specific station (e.g. SBC)' },
      },
      required: [],
    },
  },
  {
    name: 'getMyTrainStatus',
    description: 'Get live train status: current location, speed, delay, next station. Works for ANY train by number — no booking needed. Omit trainNumber to get status of the user\'s active booked train.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number to look up (optional — omit for user\'s active train)' },
      },
      required: [],
    },
  },
  {
    name: 'getMyTrainETA',
    description: 'Get dynamic ETA for a train. Works for ANY train by number — no booking needed. Omit trainNumber to get ETA of the user\'s active booked train.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number (optional — omit for user\'s active train)' },
      },
      required: [],
    },
  },
  {
    name: 'getStationETAs',
    description: 'Get station-by-station ETA predictions for a train.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number (optional — omit for user\'s active train)' },
      },
      required: [],
    },
  },
  {
    name: 'getOperationalEvents',
    description: 'Get active operational events (delays, disruptions, speed restrictions) affecting a train\'s route or the network.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number to filter events (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'getStationInfo',
    description: 'Get station reference data: name, city, zone, platforms.',
    parameters: {
      type: 'object',
      properties: {
        stationCode: { type: 'string', description: 'Station code e.g. SBC, NDLS' },
        stationName: { type: 'string', description: 'Station or city name e.g. "Bangalore", "Howrah"' },
      },
      required: [],
    },
  },
  {
    name: 'getWeather',
    description: 'Get weather data. ONLY use for explicit weather questions. Do NOT use for train searches or status.',
    parameters: {
      type: 'object',
      properties: {
        stationCode: { type: 'string' },
        stationName: { type: 'string', description: 'City or station name e.g. "Bangalore"' },
        destination: { type: 'boolean', description: 'True to get weather at user journey destination' },
        date: { type: 'string', enum: ['today', 'tomorrow'] },
      },
      required: [],
    },
  },
  {
    name: 'getTrainFare',
    description: 'Calculate exact authoritative fare for a train, class, and passenger count. Works for ANY train — no booking required.',
    parameters: {
      type: 'object',
      properties: {
        trainNumber: { type: 'string', description: 'Train number e.g. 11020' },
        trainName: { type: 'string', description: 'Train name e.g. "Konark Express"' },
        travelClass: { type: 'string', description: 'Travel class: 1A, 2A, 3A, SL, CC, 2S, EC' },
        passengerCount: { type: 'number', description: 'Number of passengers (default 1)' },
        source: { type: 'string', description: 'Source station code (if no trainNumber)' },
        destination: { type: 'string', description: 'Destination station code (if no trainNumber)' },
      },
      required: [],
    },
  },
  {
    name: 'getMyBookings',
    description: 'Get the authenticated user\'s own bookings — PNR, train, route, date, status.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getMyActiveJourney',
    description: 'Get the user\'s current or upcoming booked journey details.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getMyPNR',
    description: 'Get PNR/booking details. Passenger sees only own PNR. Staff may look up any PNR.',
    parameters: {
      type: 'object',
      properties: { pnr: { type: 'string', description: 'Specific PNR to look up' } },
      required: [],
    },
  },
  {
    name: 'getMyWalletBalance',
    description: 'Get the authenticated user\'s wallet balance and recent transactions.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'webSearch',
    description: 'Search the web for information when internal RailConnect data does not cover it AND web search is enabled. Use ONLY for: railway news, announcements, external timetable info, or when user explicitly asks to search the web. NEVER use for: bookings, PNR, wallet, live tracking — those must come from internal tools.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
];

// Map tool name → implementation
const TOOL_IMPL = {
  getTrainInfo:       tools.getTrainInfo,
  searchTrains:       tools.searchTrains,
  getMyTrainStatus:   tools.getMyTrainStatus,
  getMyTrainETA:      tools.getMyTrainETA,
  getStationETAs:     tools.getStationETAs,
  getOperationalEvents: tools.getOperationalEvents,
  getStationInfo:     tools.getStationInfo,
  getWeather:         tools.getWeather,
  getTrainFare:       tools.getTrainFare,
  getMyBookings:      tools.getMyBookings,
  getMyActiveJourney: tools.getMyActiveJourney,
  getMyPNR:           tools.getMyPNR,
  getMyWalletBalance: tools.getMyWalletBalance,
  // webSearch is handled specially (conditional on allowWebSearch)
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(context, historyContext = {}) {
  const isAdmin = context.role === 'admin';
  const isTTE   = context.role === 'tte';
  const isStaff = isAdmin || isTTE;
  const userLabel = isAdmin ? 'Administrator' : isTTE ? 'TTE/Staff' : 'Passenger';
  const { date: today, time: currentTime } = getAISystemDateTime();

  const roleSpecific = isAdmin
    ? 'As Admin, you have full access to operational and administrative information.'
    : isTTE
    ? 'As TTE/Staff, you can look up any train by number for status, ETA, and tracking. You can verify any passenger PNR.'
    : 'As a Passenger, you can ask about any train (public info), your own bookings, PNR, wallet, and journey.';

  // Inject any active context from conversation history
  let contextNote = '';
  if (historyContext.trainNumber) {
    contextNote = `\n\nCONVERSATION CONTEXT: The user has been asking about train ${historyContext.trainNumber}. If they use "it", "that train", "this train", or similar references, they mean train ${historyContext.trainNumber}.`;
  } else if (historyContext.trainName) {
    contextNote = `\n\nCONVERSATION CONTEXT: The user has been asking about "${historyContext.trainName}". If they use "it", "that train", or similar references, they mean this train.`;
  }

  return `You are the RailConnect Railway Agent — an intelligent, concise, and accurate assistant for Indian Railways.
Today: ${today}. Current time: ${currentTime} (IST).
You are assisting a ${userLabel}. Role: ${context.role || 'passenger'}.
${roleSpecific}${contextNote}

CRITICAL RULES:
1. ALWAYS use tools to get REAL data. NEVER invent train numbers, fares, delays, stations, ETAs, bookings.
2. PUBLIC data (train status, ETA, fare, route) does NOT require a booking. Call tools for any train number.
3. If a tool returns errorCode: "TRAIN_NOT_FOUND" → say the train doesn't exist in RailConnect.
4. If a tool returns errorCode: "LIVE_DATA_UNAVAILABLE" → say live tracking is currently unavailable for that train (do NOT say "not found").
5. If a tool returns errorCode: "ETA_UNAVAILABLE" → say ETA is currently unavailable.
6. Answer DIRECTLY with the real data. Do not narrate what you are about to do.
7. Use conversation context: if the user says "it", "that train", "there" — resolve from recent history.
8. webSearch: ONLY call if web search is enabled AND the query genuinely requires external info.

TOOL ROUTING:
- "where is train 11020?" → getMyTrainStatus({ trainNumber: "11020" })
- "ETA of train 11020?" → getMyTrainETA({ trainNumber: "11020" })
- "tell me about 11020" → getTrainInfo({ trainNumber: "11020" })
- "fare of 11020?" → getTrainFare({ trainNumber: "11020", travelClass: "SL" })
- "trains from SBC to NDLS" → searchTrains({ source: "SBC", destination: "NDLS" })
- "where is my train?" → getMyActiveJourney + getMyTrainStatus
- "my bookings" → getMyBookings()
- "my wallet" → getMyWalletBalance()
- "weather in Bangalore" → getWeather({ stationName: "Bangalore" })
- "what is RAC?" → answer directly (no tools)

Run PARALLEL tool calls when questions genuinely need multiple independent data sources.

OUTPUT FORMAT: Return STRICT JSON: { "reply": "your answer", "intent": "category" }
Categories: train_search, train_status, eta, pnr, bookings, wallet, weather, fare, general_chat, admin_ops
The reply must be natural language, well-formatted markdown if helpful. NEVER return plain text outside JSON.`;
}

// ============================================================
// PARSE / FILLER DETECTION
// ============================================================

function parseFinalAnswer(content) {
  if (!content) return { reply: "I'm sorry, I couldn't process that.", intent: 'unknown' };
  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
      return { reply: parsed.reply || content, intent: parsed.intent || 'general_chat' };
    }
  } catch (_) {}
  return { reply: content.replace(/```json|```/g, '').trim(), intent: 'general_chat' };
}

function isNarrationFiller(reply) {
  if (!reply || reply.length < 5) return true;
  const t = reply.trim().toLowerCase();
  return [
    /^let me /, /^i'll /, /^i will /, /^i'm (?:going|about)/,
    /^please wait/, /^checking /, /^sure,? (?:let me|i'll)/,
    /^of course,? (?:let me|i'll)/, /^certainly/i, /^absolutely/i,
    /^i'll help/, /^i can help/,
  ].some((p) => p.test(t));
}

// ============================================================
// FAST PATH — deterministic tool execution without LLM tool-calling
// ============================================================

/**
 * Try to handle the request deterministically before entering the LLM loop.
 * Returns { handled: true, toolResults } or { handled: false }.
 */
async function tryFastPath(intent, message, context, history) {
  const trainNumber = extractTrainNumber(message);
  const histCtx = extractContextFromHistory(history);
  const resolvedNumber = trainNumber || histCtx.trainNumber;
  const resolvedName = histCtx.trainName;

  switch (intent) {
    case INTENT.PUBLIC_TRAIN_STATUS:
      if (resolvedNumber || resolvedName) {
        const results = await runParallel([
          { name: 'getMyTrainStatus', args: { trainNumber: resolvedNumber } },
        ], context);
        return { handled: true, toolResults: results, intent: 'train_status' };
      }
      break;

    case INTENT.PUBLIC_TRAIN_ETA:
      if (resolvedNumber || resolvedName) {
        const results = await runParallel([
          { name: 'getMyTrainETA', args: { trainNumber: resolvedNumber } },
        ], context);
        return { handled: true, toolResults: results, intent: 'eta' };
      }
      break;

    case INTENT.PUBLIC_TRAIN_INFO:
      if (resolvedNumber || resolvedName) {
        const results = await runParallel([
          { name: 'getTrainInfo', args: { trainNumber: resolvedNumber, trainName: resolvedName } },
        ], context);
        return { handled: true, toolResults: results, intent: 'train_status' };
      }
      break;

    case INTENT.PUBLIC_TRAIN_FARE: {
      const cls = extractTravelClass(message) || 'SL';
      const count = extractPassengerCount(message);
      if (resolvedNumber || resolvedName) {
        const results = await runParallel([
          { name: 'getTrainFare', args: { trainNumber: resolvedNumber, trainName: resolvedName, travelClass: cls, passengerCount: count } },
        ], context);
        return { handled: true, toolResults: results, intent: 'fare' };
      }
      break;
    }

    case INTENT.PRIVATE_MY_TRAIN:
      // "where is my train" — need both journey and status
      {
        const results = await runParallel([
          { name: 'getMyActiveJourney', args: {} },
          { name: 'getMyTrainStatus', args: {} },
        ], context);
        return { handled: true, toolResults: results, intent: 'train_status' };
      }

    case INTENT.PRIVATE_MY_BOOKINGS:
      {
        const results = await runParallel([
          { name: 'getMyBookings', args: {} },
        ], context);
        return { handled: true, toolResults: results, intent: 'bookings' };
      }

    case INTENT.PRIVATE_MY_WALLET:
      {
        const results = await runParallel([
          { name: 'getMyWalletBalance', args: {} },
        ], context);
        return { handled: true, toolResults: results, intent: 'wallet' };
      }

    case INTENT.PRIVATE_MY_JOURNEY:
      {
        const results = await runParallel([
          { name: 'getMyActiveJourney', args: {} },
          { name: 'getMyTrainETA', args: {} },
        ], context);
        return { handled: true, toolResults: results, intent: 'eta' };
      }

    case INTENT.PRIVATE_MY_PNR: {
      const pnr = extractPNR(message);
      const results = await runParallel([
        { name: 'getMyPNR', args: { pnr } },
      ], context);
      return { handled: true, toolResults: results, intent: 'pnr' };
    }

    case INTENT.PUBLIC_EVENTS: {
      const results = await runParallel([
        { name: 'getOperationalEvents', args: { trainNumber: resolvedNumber || undefined } },
      ], context);
      return { handled: true, toolResults: results, intent: 'train_status' };
    }

    default:
      break;
  }

  return { handled: false };
}

// ============================================================
// MAIN AGENT LOOP
// ============================================================

async function runAgent({ message, history = [], context }) {
  const historyContext = extractContextFromHistory(history);
  const intent = classifyIntent(message, history);
  const systemPrompt = buildSystemPrompt(context, historyContext);
  const canWebSearch = Boolean(context.allowWebSearch);

  // Filter tools visible to LLM: only include webSearch if enabled
  const visibleTools = canWebSearch
    ? TOOL_SCHEMAS
    : TOOL_SCHEMAS.filter((t) => t.name !== 'webSearch');

  // ─── FAST PATH: deterministic high-confidence intents ───────────────
  if (intent !== INTENT.GENERAL_CHAT && intent !== INTENT.LLM_DECIDE) {
    try {
      const fast = await tryFastPath(intent, message, context, history);
      if (fast.handled) {
        // Fast path: one LLM call to synthesize the answer
        const dataStr = Object.entries(fast.toolResults)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n\n');

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-10).map((m) => ({
            role: m.role === 'bot' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: message },
          { role: 'assistant', content: '[Data retrieved]' },
          {
            role: 'user',
            content: `Railway data:\n\n${dataStr}\n\nUser asked: "${message}"\n\nOutput ONLY a JSON object {"reply":"<concise natural-language answer using this exact data>","intent":"${fast.intent}"}. Do NOT invent any additional data. If errorCode is TRAIN_NOT_FOUND say the train doesn't exist. If LIVE_DATA_UNAVAILABLE say live tracking is unavailable.`,
          },
        ];

        const result = await callAI({ messages, tools: [], toolChoice: null, maxTokens: 800, temperature: 0.2 });
        const { reply, intent: finalIntent } = parseFinalAnswer(result.content);

        if (!isNarrationFiller(reply)) {
          return { reply, intent: finalIntent || fast.intent, toolCalls: 1, llmCalls: 1, fastPath: true, webSearchUsed: false, webSources: [] };
        }
        // If filler, fall through to full LLM loop
      }
    } catch (err) {
      console.warn('[Agent] Fast path failed, falling back to full loop:', err.message);
    }
  }

  // ─── FULL LLM TOOL-CALLING LOOP ─────────────────────────────────────
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  const MAX_ITERATIONS = 4;
  let iteration = 0;
  const priorToolCalls = new Set();
  let toolResultsReceived = false;
  let webSearchUsed = false;
  let webSources = [];
  let llmCalls = 0;
  let totalToolCalls = 0;
  let postToolRetries = 0;
  const MAX_POST_TOOL_RETRIES = 1;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    try {
      llmCalls++;
      const result = await callAI({
        messages,
        tools: visibleTools,
        toolChoice: 'auto',
        maxTokens: 1500,
        temperature: 0.2,
      });

      const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;

      // ─── No tool calls → final answer or retry ───
      if (!hasToolCalls) {
        const { reply, intent: parsedIntent } = parseFinalAnswer(result.content);

        if (toolResultsReceived) {
          if (isNarrationFiller(reply) && postToolRetries < MAX_POST_TOOL_RETRIES) {
            postToolRetries++;
            messages.push({
              role: 'user',
              content: 'The data is above. Output ONLY {"reply":"<actual answer>","intent":"..."} with the real answer now.',
            });
            continue;
          }
          return { reply, intent: parsedIntent, toolCalls: totalToolCalls, llmCalls, webSearchUsed, webSources };
        }

        return { reply, intent: parsedIntent, toolCalls: 0, llmCalls, webSearchUsed, webSources };
      }

      // ─── Execute tool calls ───
      const deduplicatedCalls = [];
      for (const tc of result.toolCalls) {
        const fp = `${tc.name}:${JSON.stringify(tc.arguments || {})}`;
        if (priorToolCalls.has(fp)) {
          messages.push({ role: 'assistant', content: result.content || null, tool_calls: [tc] });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ _blocked: true }) });
          continue;
        }
        priorToolCalls.add(fp);
        deduplicatedCalls.push(tc);
      }

      if (deduplicatedCalls.length === 0) {
        messages.push({ role: 'user', content: 'All data is above. Output your final JSON answer NOW.' });
        continue;
      }

      // Execute in PARALLEL
      totalToolCalls += deduplicatedCalls.length;
      const toolResults = await Promise.all(
        deduplicatedCalls.map(async (tc) => {
          // webSearch is a special tool
          if (tc.name === 'webSearch') {
            if (!canWebSearch) {
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ available: false, reason: 'Web search is not enabled for this session.' }) };
            }
            try {
              const webResult = await searchWeb(tc.arguments?.query || message);
              if (webResult.success) {
                webSearchUsed = true;
                webSources = webResult.results || [];
              }
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(webResult) };
            } catch (e) {
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ available: false, error: e.message }) };
            }
          }

          const impl = TOOL_IMPL[tc.name];
          if (!impl) {
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }) };
          }
          try {
            const tr = await impl(context, tc.arguments || {});
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(tr) };
          } catch (toolErr) {
            console.error(`[Agent] Tool ${tc.name} failed:`, toolErr.message);
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ available: false, error: 'Tool execution failed', errorCode: 'TOOL_ERROR' }) };
          }
        })
      );

      toolResultsReceived = true;
      messages.push({ role: 'assistant', content: result.content || null, tool_calls: deduplicatedCalls });
      messages.push(...toolResults);
      messages.push({
        role: 'user',
        content: 'Tool results above. Output your final answer as JSON {"reply":"<actual answer>","intent":"..."}. Give the real answer with actual data. Do not narrate.',
      });

    } catch (err) {
      if (err instanceof AIProviderError) {
        if (['NETWORK', 'SERVER_ERROR', 'TIMEOUT', 'UNAUTHORIZED'].includes(err.code)) {
          try {
            const fr = await runFallbackAgent({ message, context });
            return { reply: fr.reply, intent: fr.intent, providerFallback: true, providerError: { code: err.code, message: err.message }, webSearchUsed: false, webSources: [] };
          } catch (fbErr) {
            console.error('[Agent] Fallback failed:', fbErr.message);
          }
        }
        let userMsg = err.message;
        if (err.code === 'UNAUTHORIZED') userMsg = 'The AI service is not configured. Please contact support.';
        else if (err.code === 'RATE_LIMIT') userMsg = 'The AI service is rate limited. Please try again in a moment.';
        else if (err.code === 'TIMEOUT' || err.code === 'NETWORK') userMsg = "I'm having trouble connecting to the AI service. Please try again.";
        return { reply: userMsg, intent: 'error', providerError: { code: err.code, message: err.message }, webSearchUsed: false, webSources: [] };
      }
      console.error('[Agent] Unexpected error:', err);
      return { reply: 'I encountered an unexpected error. Please try again.', intent: 'error', webSearchUsed: false, webSources: [] };
    }
  }

  // Max iterations — try fallback
  try {
    const fallbackRes = await runFallbackAgent({ message, context });
    return { ...fallbackRes, toolCalls: totalToolCalls, llmCalls, webSearchUsed, webSources, fallbackUsed: true };
  } catch (e) {
    return { reply: 'I encountered an issue generating a complete answer. Please try rephrasing.', intent: 'error', toolCalls: totalToolCalls, llmCalls, webSearchUsed, webSources };
  }
}

// ============================================================
// detectRequiredTools — PRESERVED for fallback agent compatibility
// Now lower priority — only used as fallback when LLM loop fails.
// ============================================================
function detectRequiredTools(userMessage) {
  const msg = userMessage.toLowerCase().trim();
  const needed = [];
  const trainNumber = extractTrainNumber(userMessage);

  const isTrainSearchQuery =
    /\b(trains?|list|all|show|find|search|available|running|schedule)\b/.test(msg) &&
    /\b(bangalore|delhi|mumbai|chennai|kolkata|howrah|pune|hyderabad|ahmedabad|sbc|ndls|mas|hwh|bct|cst|blr|sc|lko|adi|pnq|ngp|from|to|at|in)\b/.test(msg);

  if (isTrainSearchQuery) needed.push({ name: 'searchTrains', args: {} });

  if (/\b(my\s+bookings?|show\s+bookings?|booking\s+history|past\s+bookings?|list\s+bookings?)\b/.test(msg))
    needed.push({ name: 'getMyBookings', args: {} });

  if (/\b(pnr|check\s+pnr|my\s+pnr|booking\s+status|check\s+ticket|ticket\s+status)\b/.test(msg))
    needed.push({ name: 'getMyPNR', args: { pnr: extractPNR(userMessage) } });

  if (/\b(where\s+is\s+my\s+train|my\s+train|track\s+my\s+train|live\s+status|current\s+location|status\s+of\s+train)\b/.test(msg) || /\b\d{5}\b/.test(msg))
    needed.push({ name: 'getMyTrainStatus', args: { trainNumber } });

  if (/\b(when\s+will|eta|reach|arrive|destination|how\s+long|how\s+late)\b/.test(msg))
    needed.push({ name: 'getMyTrainETA', args: { trainNumber } });

  if (/\b(fare|price|cost|ticket\s+price|how\s+much|pricing)\b/.test(msg))
    needed.push({ name: 'getTrainFare', args: { trainNumber, travelClass: extractTravelClass(userMessage) || 'SL', passengerCount: extractPassengerCount(userMessage) } });

  if (/\b(wallet|balance)\b/.test(msg))
    needed.push({ name: 'getMyWalletBalance', args: {} });

  if (/\b(tell\s+me\s+about|info|information|details?|what\s+is\s+train)\b/.test(msg) && /\b\d{5}\b/.test(msg))
    needed.push({ name: 'getTrainInfo', args: { trainNumber } });

  if (/\b(weather|forecast|temperature|rain)\b/.test(msg)) {
    const cityMatch = msg.match(/(?:weather|forecast|temperature|rain)\s+(?:in|at|of)\s+([a-z\s]+?)(?:\s+(?:tomorrow|today)|[?]*$)/i);
    if (cityMatch) needed.push({ name: 'getWeather', args: { stationName: cityMatch[1].trim(), date: /\btomorrow\b/.test(msg) ? 'tomorrow' : 'today' } });
    else if (/\b(destination|my\s+destination)\b/.test(msg)) needed.push({ name: 'getWeather', args: { destination: true } });
  }

  return needed;
}

module.exports = {
  runAgent,
  TOOL_SCHEMAS,
  getProviderStatus,
  getWebSearchAvailable,
  detectRequiredTools,
  classifyIntent,
  INTENT,
};
