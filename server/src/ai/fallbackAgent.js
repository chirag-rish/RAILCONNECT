/**
 * SIH26028 — AI Assistant 2.0: Rule-Based Fallback Agent (v3)
 *
 * Works WITHOUT any LLM by using intent detection + railway tools.
 * Updated to use the new architecture:
 *   - getTrainInfo for general train information
 *   - getMyWalletBalance for wallet queries
 *   - New error codes: TRAIN_NOT_FOUND, LIVE_DATA_UNAVAILABLE, ETA_UNAVAILABLE
 *   - Public train queries work without booking restriction
 */

const tools = require('./railwayTools');
const { formatTimeForPassenger, formatDateForPassenger } = require('../utils/istTime');

// ============================================================
// ENTITY EXTRACTION
// ============================================================

function extractTrainNumber(message) {
  const m = message.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function extractTravelClass(message) {
  const m = message.toUpperCase().match(/\b(1A|2A|3A|AC2|CC|SL|2S|EC)\b/);
  return m ? m[1] : 'SL';
}

function extractPassengerCount(message) {
  if (!message) return 1;
  const patterns = [
    /\b(\d+)\s*(?:passengers?|adults?|people|tickets?|travellers?)\b/i,
    /\bfor\s+(\d+)\s*(?:passengers?|adults?|people|tickets?|travellers?)?\b/i,
    /\b(\d+)\s+passenger/i,
    /passenger[s]?\s*[:=]?\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m && m[1]) {
      const count = parseInt(m[1], 10);
      if (count > 0 && count <= 50) return count;
    }
  }
  return 1;
}

function extractPNR(message) {
  if (!message) return null;
  const withLabel = message.match(/(?:pnr|booking)\s+(?:status\s+)?([A-Z0-9]{5,12})/i);
  if (withLabel) return withLabel[1].toUpperCase();
  const bare = message.match(/\b([A-Z]{2,3}\d{5,10}|\d{10})\b/i);
  return bare ? bare[1].toUpperCase() : null;
}

// ============================================================
// INTENT DETECTION
// ============================================================
function detectIntent(message) {
  const lower = message.toLowerCase();

  if (/\b(fare|price|cost|how\s+much|ticket\s+cost|pricing)\b/.test(lower)) return 'train_fare';
  if (/\b(my\s+bookings?|show\s+bookings?|booking\s+history|past\s+bookings?|list\s+bookings?)\b/.test(lower)) return 'bookings';
  if (/\b(pnr|check\s+pnr|my\s+pnr|booking\s+status|check\s+ticket|ticket\s+status)\b/.test(lower)) return 'pnr_status';
  if (/\b(wallet|wallet\s+balance|my\s+balance)\b/.test(lower)) return 'wallet';
  if (/\b(eta|when\s+will|arrive|reach|how\s+long|how\s+late)\b/.test(lower)) return 'eta';
  if (/\b(status|where\s+is|current\s+status|running\s+status|track|delay|late)\b/.test(lower) ||
      /\b(status\s+of\s+train)\b/.test(lower)) return 'train_status';
  if (/\b\d{5}\b/.test(lower) && /\b(status|where|eta|arrive|reach|train|info|about|stops?|route|schedule|details?)\b/.test(lower)) {
    if (/\b(stops?|stations?|route|schedule|info|about|details?|tell\s+me|what\s+is)\b/.test(lower)) return 'train_info';
    return 'train_status';
  }
  if (/\b\d{5}\b/.test(lower)) return 'train_status';
  if (/\b(weather|forecast|temperature|rain)\b/.test(lower)) return 'weather';
  if (/\b(station\s+info|station\s+details)\b/.test(lower)) return 'station_info';
  if (/\b(trains?|list|all|show|find|search|available|running|schedule)\b/.test(lower) &&
      /\b(bangalore|delhi|mumbai|chennai|kolkata|howrah|pune|hyderabad|ahmedabad|jaipur|lucknow|chandigarh|patna|bhopal|nagpur|indore|surat|vijayawada|coimbatore|trivandrum|guwahati|bhubaneswar|ranchi|dehradun|amritsar|mysore|sbc|ndls|mas|hwh|bct|cst|blr|sec|sc|bsb|lko|jp|adi|pnq|ngp|bpl|rnc|dbrg|bea|jat|from|to|at|in|today|station)\b/.test(lower)) {
    return 'train_search';
  }
  return 'general_chat';
}

// ============================================================
// EXTRACT STATION FROM MESSAGE
// ============================================================
function extractStation(message) {
  const lower = message.toLowerCase();
  const patterns = [
    /(?:weather|forecast|temperature|rain)\s+(?:in|at|of)\s+([a-z\s]+?)(?:\s+(?:tomorrow|today)|\?*$)/i,
    /(?:trains?\s+(?:in|at|from|to|through))\s+([a-z\s]+?)(?:\s+(?:today|tomorrow|now)|\?*$)/i,
    /(?:reach|arrive|get\s+to|eta\s+to|arrival\s+at)\s+([a-z\s]+?)(?:\?|$)/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m && m[1]) {
      const station = m[1].trim();
      if (station.length > 1 && station.length < 30) return station.toUpperCase();
    }
  }
  return null;
}

// ============================================================
// FALLBACK AGENT ENTRY POINT
// ============================================================
async function runFallbackAgent({ message, context }) {
  const intent = detectIntent(message);
  const station = extractStation(message);
  const trainNumber = extractTrainNumber(message);

  const toolSequences = {
    train_info:          ['getTrainInfo'],
    train_search:        ['searchTrains'],
    train_status:        ['getMyTrainStatus'],
    eta:                 ['getMyTrainETA'],
    pnr_status:          ['getMyPNR'],
    bookings:            ['getMyBookings'],
    active_journey:      ['getMyActiveJourney'],
    station_info:        ['getStationInfo'],
    weather:             ['getWeather'],
    operational_events:  ['getMyTrainStatus', 'getOperationalEvents'],
    train_fare:          ['getTrainFare'],
    wallet:              ['getMyWalletBalance'],
  };

  const sequence = toolSequences[intent] || [];
  if (sequence.length === 0) {
    return {
      reply: 'I can help you with train searches, live status, PNR checks, bookings, ETA, fares, wallet, weather, and more. What would you like to know?',
      intent: 'general_chat',
    };
  }

  const toolResults = {};

  for (const toolName of sequence) {
    const impl = tools[toolName];
    if (!impl) continue;
    try {
      const args = {};

      if (['getMyTrainStatus', 'getMyTrainETA', 'getStationETAs', 'getOperationalEvents', 'getTrainInfo'].includes(toolName)) {
        args.trainNumber = trainNumber;
      }
      if (toolName === 'getTrainFare') {
        args.trainNumber = trainNumber;
        args.travelClass = extractTravelClass(message);
        args.passengerCount = extractPassengerCount(message);
      }
      if (toolName === 'searchTrains' && station) {
        args.station = station;
      }
      if (toolName === 'getStationInfo' && station) {
        args.stationName = station;
      }
      if (toolName === 'getMyPNR') {
        args.pnr = extractPNR(message);
      }
      if (toolName === 'getWeather') {
        if (/\b(destination|my\s+destination)\b/.test(message.toLowerCase())) {
          args.destination = true;
        } else if (station) {
          args.stationName = station;
        }
        if (/\b(tomorrow|next\s+day)\b/.test(message.toLowerCase())) {
          args.date = 'tomorrow';
        }
      }

      const result = await impl(context, args);
      toolResults[toolName] = result;
    } catch (err) {
      toolResults[toolName] = { available: false, error: err.message };
    }
  }

  return formatResponse(intent, toolResults, { message, station, trainNumber });
}

// ============================================================
// FORMAT RESPONSE — converts tool results to readable text
// ============================================================
function fmtDelay(d) {
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return 'on time';
  return `${Math.round(n)} min late`;
}

function fmtSource(src) {
  if (!src) return 'Unknown';
  if (src === 'SIMULATOR') return 'Simulator';
  if (src === 'LIVE_PROVIDER') return 'Live provider';
  if (src === 'OFFICIAL_RAILWAY') return 'Official railway feed';
  return src;
}

function formatResponse(intent, toolResults, params) {
  switch (intent) {

    case 'train_info': {
      const data = toolResults.getTrainInfo;
      if (!data?.available) {
        if (data?.errorCode === 'TRAIN_NOT_FOUND') {
          return { reply: `Train ${params.trainNumber || ''} was not found in the RailConnect database. Please verify the train number.`, intent: 'train_search' };
        }
        return { reply: data?.detail || data?.reason || 'Train information is currently unavailable.', intent: 'train_search' };
      }
      const t = data.train;
      let reply = `**${t.name} (${t.trainNumber})**\n`;
      reply += `Type: ${t.type || 'N/A'} | ${t.source} → ${t.destination}\n`;
      if (t.departureTime) reply += `Departs: ${t.departureTime} | Arrives: ${t.arrivalTime}\n`;
      if (t.daysOfOperation?.length) reply += `Runs on: ${t.daysOfOperation.join(', ')}\n`;
      if (t.distance) reply += `Distance: ${t.distance} km\n`;
      if (data.route?.stations?.length) {
        reply += `\n**Stops (${data.route.stations.length}):**\n`;
        const stops = data.route.stations.slice(0, 10);
        stops.forEach((s, i) => {
          reply += `${i + 1}. ${s.name || s.code} (${s.code})`;
          if (s.scheduledArrival) reply += ` — Arr: ${s.scheduledArrival}`;
          reply += '\n';
        });
        if (data.route.stations.length > 10) reply += `... and ${data.route.stations.length - 10} more stations.\n`;
      }
      return { reply, intent: 'train_status' };
    }

    case 'train_search': {
      const data = toolResults.searchTrains;
      if (!data?.available) return { reply: data?.reason || 'Unable to search trains right now.', intent: 'train_search' };
      if (!data.trains || data.trains.length === 0) return { reply: data.message || 'No trains found matching your criteria.', intent: 'train_search' };
      let reply = `**Found ${data.trains.length} train(s):**\n\n`;
      data.trains.forEach((t, i) => {
        reply += `${i + 1}. **${t.trainNumber} — ${t.name}**\n`;
        reply += `   ${t.source} → ${t.destination}`;
        if (t.departureTime) reply += ` | Departs: ${t.departureTime}`;
        if (t.arrivalTime) reply += ` | Arrives: ${t.arrivalTime}`;
        if (t.delayMinutes > 0) reply += ` | ${fmtDelay(t.delayMinutes)}`;
        reply += '\n';
      });
      return { reply, intent: 'train_search' };
    }

    case 'train_status': {
      const status = toolResults.getMyTrainStatus;
      if (!status?.available) {
        if (status?.errorCode === 'TRAIN_NOT_FOUND') {
          return { reply: `Train ${params.trainNumber || ''} was not found in the RailConnect database.`, intent: 'train_status' };
        }
        if (status?.errorCode === 'NO_ACTIVE_BOOKING') {
          return { reply: 'No active booking found. Provide a specific train number (e.g., "status of train 11020") or make a booking first.', intent: 'train_status' };
        }
        return { reply: status?.reason || 'Live status is currently unavailable.', intent: 'train_status' };
      }

      if (!status.hasLiveTelemetry) {
        return {
          reply: `**${status.train.name} (${status.train.trainNumber})** — ${status.train.source} → ${status.train.destination}\n\n${status.message || 'Live tracking data is currently unavailable for this train.'}`,
          intent: 'train_status',
        };
      }

      let reply = `**${status.train.name} (${status.train.trainNumber})**\n\n`;
      reply += `📍 **Current:** Near ${status.currentStationName || status.currentStation}\n`;
      reply += `➡️ **Next stop:** ${status.nextStationName || status.nextStation}\n`;
      if (status.speedKmh != null) reply += `🚄 **Speed:** ${status.speedKmh} km/h\n`;
      reply += `⏱️ **Delay:** ${fmtDelay(status.delayMinutes)}\n`;
      reply += `📊 **Status:** ${status.status}`;
      if (status.isStale) reply += ' *(data may be slightly delayed)*';
      if (status.sourceLabel) reply += `\n📡 **Source:** ${status.sourceLabel}`;
      return { reply, intent: 'train_status' };
    }

    case 'eta': {
      const eta = toolResults.getMyTrainETA;
      if (!eta?.available) {
        if (eta?.errorCode === 'TRAIN_NOT_FOUND') {
          return { reply: `Train ${params.trainNumber || ''} was not found in the RailConnect database.`, intent: 'eta' };
        }
        return { reply: eta?.reason || 'No ETA information available.', intent: 'eta' };
      }
      if (!eta.hasDynamicETA) {
        return { reply: `${eta.trainName ? `**${eta.trainName} (${eta.trainNumber})**\n\n` : ''}${eta.reason || 'ETA is not currently available.'}`, intent: 'eta' };
      }
      if (eta.destination) {
        const arrival = new Date(eta.destination.predictedArrival);
        const arrivalStr = formatTimeForPassenger(arrival);
        let reply = `**${eta.trainName} (${eta.trainNumber})**\n\n`;
        reply += `🕐 **Destination ETA:** ${arrivalStr}\n`;
        reply += `⏱️ **Predicted delay:** ${fmtDelay(eta.destination.predictedDelayMinutes)}\n`;
        if (eta.destination.stationsAway) reply += `📍 **Stations away:** ${eta.destination.stationsAway}\n`;
        reply += `📡 **Source:** ${fmtSource(eta.source)}`;
        return { reply, intent: 'eta' };
      }
      return { reply: `${eta.trainName || ''} (${eta.trainNumber || ''})\n\nETA data received but destination details not available.`, intent: 'eta' };
    }

    case 'pnr_status': {
      const pnr = toolResults.getMyPNR;
      if (!pnr?.available || !pnr.found) return { reply: pnr?.message || 'No PNR found for your account.', intent: 'pnr_status' };
      const first = pnr.pnrs[0];
      let reply = `**PNR: ${first.pnr}**\n**Train:** ${first.trainName} (${first.trainNumber})\n**Route:** ${first.source} → ${first.destination}\n**Journey:** ${formatDateForPassenger(first.journeyDate)}\n**Class:** ${first.travelClass}\n**Status:** ${first.status}`;
      if (first.passengers?.length) {
        reply += '\n\n**Passengers:**\n';
        first.passengers.forEach((p, i) => { reply += `${i + 1}. ${p.name} (Age ${p.age}) - ${p.status}\n`; });
      }
      return { reply, intent: 'pnr_status' };
    }

    case 'bookings': {
      const bookings = toolResults.getMyBookings;
      if (!bookings?.available || !bookings.bookings?.length) return { reply: 'No bookings found for your account.', intent: 'bookings' };
      let reply = '**Your Bookings:**\n\n';
      bookings.bookings.forEach((b, i) => {
        reply += `${i + 1}. **${b.trainName} (${b.trainNumber})** — ${b.source} → ${b.destination}\n`;
        reply += `   ${formatDateForPassenger(b.journeyDate)} | ${b.status} | ₹${b.totalFare}\n`;
        reply += `   PNR: ${b.pnr}\n\n`;
      });
      return { reply, intent: 'bookings' };
    }

    case 'wallet': {
      const wallet = toolResults.getMyWalletBalance;
      if (!wallet?.available) return { reply: 'Unable to retrieve wallet information.', intent: 'wallet' };
      let reply = `**Your Wallet Balance: ₹${wallet.balance}**\n`;
      if (wallet.totalAdded != null) reply += `\nTotal Added: ₹${wallet.totalAdded} | Total Spent: ₹${wallet.totalSpent}`;
      if (wallet.recentTransactions?.length) {
        reply += '\n\n**Recent Transactions:**\n';
        wallet.recentTransactions.forEach((t, i) => {
          reply += `${i + 1}. ${t.type === 'credit' ? '↑' : '↓'} ₹${t.amount} — ${t.description || 'N/A'}\n`;
        });
      }
      return { reply, intent: 'wallet' };
    }

    case 'active_journey': {
      const journey = toolResults.getMyActiveJourney;
      if (!journey?.available) return { reply: 'No active or upcoming journey found. Please make a booking.', intent: 'active_journey' };
      return {
        reply: `**Your Active Journey**\n\n**PNR:** ${journey.booking.pnr}\n**Train:** ${journey.booking.trainNumber} — ${journey.booking.trainName}\n**Route:** ${journey.booking.source} → ${journey.booking.destination}\n**Date:** ${formatDateForPassenger(journey.booking.journeyDate)}\n**Class:** ${journey.booking.travelClass}\n**Status:** ${journey.booking.status}`,
        intent: 'active_journey',
      };
    }

    case 'station_info': {
      const info = toolResults.getStationInfo;
      if (!info?.available || !info.found) return { reply: info?.reason || 'Station not found.', intent: 'station_info' };
      const s = info.station;
      let reply = `**${s.name} (${s.code})**\n${s.city}, ${s.state}`;
      if (s.zone) reply += `\nZone: ${s.zone}`;
      if (s.platformCount) reply += `\nPlatforms: ${s.platformCount}`;
      return { reply, intent: 'station_info' };
    }

    case 'weather': {
      const weather = toolResults.getWeather;
      if (!weather?.success) return { reply: weather?.error || 'Weather information is temporarily unavailable.', intent: 'weather' };
      const loc = weather.location;
      const current = weather.current;
      let reply = `**Weather at ${loc?.stationName || loc?.city || 'Location'}**\n\n`;
      if (weather.tomorrow) {
        const t = weather.tomorrow;
        reply += `**Tomorrow (${t.date})**\nTemperature: ${t.minTemp}°C — ${t.maxTemp}°C\nCondition: ${t.condition}\n`;
      } else if (current) {
        reply += `Temperature: ${current.temperature}°C (feels like ${current.feelsLike}°C)\nCondition: ${current.condition}\n`;
        if (current.humidity != null) reply += `Humidity: ${current.humidity}%\n`;
        if (current.windSpeed != null) reply += `Wind: ${current.windSpeed} km/h\n`;
      }
      reply += `\nSource: Open-Meteo`;
      return { reply, intent: 'weather' };
    }

    case 'operational_events': {
      const status = toolResults.getMyTrainStatus;
      const events = toolResults.getOperationalEvents;
      const trainLabel = status?.train ? `${status.train.trainNumber} — ${status.train.name}` : 'Your train';
      let reply = `**${trainLabel}**\n`;
      if (events?.available && events.hasEvents) {
        reply += `\n**Active Events:**\n`;
        events.events.forEach((e, i) => {
          reply += `${i + 1}. ${e.eventType} (${e.severity})\n`;
          if (e.description) reply += `   ${e.description}\n`;
        });
      } else {
        reply += '\nNo active events affecting this train.';
      }
      return { reply, intent: 'operational_events' };
    }

    case 'train_fare': {
      const fare = toolResults.getTrainFare;
      if (!fare?.available) {
        if (fare?.errorCode === 'TRAIN_NOT_FOUND') {
          return { reply: `Train ${params.trainNumber || ''} was not found in the RailConnect database.`, intent: 'train_fare' };
        }
        return { reply: fare?.reason || 'Unable to calculate fare. Please provide a valid train number.', intent: 'train_fare' };
      }
      let reply = `**Fare for ${fare.trainName} (${fare.trainNumber})**\n\n`;
      reply += `**Class:** ${fare.travelClass}\n`;
      reply += `**Passengers:** ${fare.passengerCount}\n`;
      reply += `**Base Fare:** ₹${fare.fareBreakdown.baseFare}\n`;
      reply += `**GST (18%):** ₹${fare.fareBreakdown.gst}\n`;
      reply += `**Total Fare:** ₹${fare.fareBreakdown.totalFare}\n\n`;
      reply += `*${fare.priceNote}*`;
      return { reply, intent: 'train_fare' };
    }

    default:
      return {
        reply: 'I can help you with train searches, live status, ETA, PNR checks, bookings, fares, wallet, and more. What would you like to know?',
        intent: 'general_chat',
      };
  }
}

module.exports = { runFallbackAgent, detectIntent };
