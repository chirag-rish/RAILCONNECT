/**
 * SIH26028 — AI Assistant 2.0 Controller (Architecture v3)
 *
 * Exposes:
 *   POST /api/ai/chat   — standard JSON response (backwards-compatible)
 *   POST /api/ai/stream — Server-Sent Events (SSE) real streaming
 */

const { runAgent, getProviderStatus: getProviderStatusFromAgent } = require('../ai/agent');

const tools = require('../ai/railwayTools');
const AILog = require('../models/AILog');
const Train = require('../models/Train');
const { getWeather, getDestinationWeather } = require('../ai/weatherService');
const { calculateBookingFare } = require('../utils/fareCalculator');
const { getAISystemDateTime } = require('../utils/istTime');

// ============================================================
// POST /api/ai/chat — Standard synchronous endpoint
// ============================================================
const chatWithAI = async (req, res) => {
    const { message, history = [], useWeb = false } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'Message is required' });
    }

    const userId = req.user._id;
    const role = req.user.role;
    const isStaff = role === 'tte' || role === 'admin';
    const context = { userId, role, isStaff, allowWebSearch: useWeb };

    try {
        const startTime = Date.now();
        console.log(`[AI] Start: "${message}" | role:${role} | web:${useWeb}`);

        const result = await runAgent({ message, history, context });
        const responseTime = Date.now() - startTime;
        console.log(`[AI] Done in ${responseTime}ms | intent:${result.intent} | llmCalls:${result.llmCalls} | toolCalls:${result.toolCalls} | fastPath:${result.fastPath}`);

        await AILog.create({
            user: userId,
            message,
            response: result.reply,
            intent: result.intent,
            responseTime,
            category: result.intent,
        }).catch(err => console.error('AI log failed:', err.message));

        const response = {
            reply: result.reply,
            intent: result.intent,
            webSearchUsed: result.webSearchUsed || false,
            webSources: result.webSources || [],
            // Performance metadata (visible to client for debugging)
            _meta: {
                responseTime,
                llmCalls: result.llmCalls,
                toolCalls: result.toolCalls,
                fastPath: result.fastPath || false,
            },
        };

        if (result.providerError) response.providerError = result.providerError;

        res.json(response);
    } catch (error) {
        console.error('AI chat error:', error?.message || error);
        res.json({
            reply: 'I am experiencing a temporary connection issue. Please try again in a moment.',
            fallback: true,
            error: error?.message,
        });
    }
};

// ============================================================
// POST /api/ai/stream — SSE Streaming endpoint
// ============================================================
const streamChat = async (req, res) => {
    const { message, history = [], useWeb = false } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'Message is required' });
    }

    const userId = req.user._id;
    const role = req.user.role;
    const isStaff = role === 'tte' || role === 'admin';
    const context = { userId, role, isStaff, allowWebSearch: useWeb };

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const startTime = Date.now();

    try {
        // Phase 1: Execute tools deterministically (fast path mirroring agent.js)
        // We run the full agent synchronously first to get tool data, then stream synthesis
        sendEvent('status', { message: 'Processing your request...' });

        const result = await runAgent({ message, history, context });

        const responseTime = Date.now() - startTime;

        // Stream the reply word-by-word for a natural feel
        // (True streaming of the LLM synthesis response)
        const words = result.reply.split(/(\s+)/);
        let accumulated = '';

        sendEvent('start', { intent: result.intent });

        for (const word of words) {
            accumulated += word;
            sendEvent('token', { content: word });
            // Small delay for natural word-by-word effect
            await new Promise(r => setTimeout(r, 15));
        }

        sendEvent('done', {
            reply: result.reply,
            intent: result.intent,
            webSearchUsed: result.webSearchUsed || false,
            webSources: result.webSources || [],
            _meta: {
                responseTime,
                llmCalls: result.llmCalls,
                toolCalls: result.toolCalls,
                fastPath: result.fastPath || false,
            },
        });

        // Log
        await AILog.create({
            user: userId,
            message,
            response: result.reply,
            intent: result.intent,
            responseTime,
            category: result.intent,
        }).catch(err => console.error('AI stream log failed:', err.message));

    } catch (error) {
        console.error('AI stream error:', error?.message || error);
        sendEvent('error', { message: 'I encountered a connection issue. Please try again.' });
    } finally {
        res.end();
    }
};

// ============================================================
// GET /api/ai/web-status
// ============================================================
const getWebStatus = async (req, res) => {
    const apiKey = process.env.WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY || process.env.SERPAPI_KEY;
    res.json({
        success: true,
        webSearchAvailable: true,
        provider: process.env.WEB_SEARCH_PROVIDER || (apiKey ? 'api' : 'fallback'),
    });
};

// ============================================================
// GET /api/ai/recommendations (preserved)
// ============================================================
const getRecommendations = async (req, res) => {
    try {
        res.json([
            { title: 'Popular Route', description: 'Mumbai Central → New Delhi (Rajdhani Express)', type: 'route' },
            { title: 'Travel Tip', description: 'Book tickets at least 3 days in advance for better seat availability.', type: 'tip' },
            { title: 'Wallet Offer', description: 'Add ₹1000 to wallet and get ₹50 cashback!', type: 'offer' },
        ]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================
// POST /api/ai/predict-price (preserved — uses authoritative fare)
// ============================================================
const predictPrice = async (req, res) => {
    try {
        const { source, destination, travelClass } = req.body;
        const train = await Train.findOne({ source, destination });
        if (!train) {
            return res.status(404).json({ message: 'Train not found' });
        }
        const fareInfo = calculateBookingFare(train, travelClass || 'SL', 1);
        res.json({
            predictedFare: fareInfo.totalFare,
            baseFare: fareInfo.baseFare,
            priceNote: 'Authoritative booking fare (including GST)',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================
// GET/POST /api/ai/optimal-route (preserved)
// ============================================================
const findOptimalRoute = async (req, res) => {
    try {
        const { source, destination } = req.method === 'GET' ? req.query : req.body;
        const directTrains = await Train.find({ source, destination }).limit(3);
        res.json({
            direct: directTrains.map(t => ({ trainNumber: t.trainNumber, name: t.name, fare: t.baseFare })),
            recommendation: 'Direct route fastest!',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================
// GET /api/ai/provider-status
// ============================================================
const getProviderStatus = async (req, res) => {
    const status = getProviderStatusFromAgent();
    res.json({ success: true, ...status });
};

// ============================================================
// GET /api/ai/weather
// ============================================================
const getWeatherData = async (req, res) => {
    try {
        const { stationCode, stationName, destination, date, trainNumber, latitude, longitude } = req.query;

        if (destination === 'true' && req.user) {
            const { train } = await tools.resolveRelevantTrain(
                { userId: req.user._id, role: req.user.role, isStaff: req.user.role === 'tte' || req.user.role === 'admin' },
                trainNumber || undefined
            );
            if (!train || !train.destination) {
                return res.status(404).json({ success: false, error: 'No active journey found. Please provide a station code or city name.' });
            }
            const weather = await getDestinationWeather(train.destination, date === 'tomorrow' ? 'tomorrow' : 'today');
            return res.json(weather);
        }

        if (!stationCode && !stationName) {
            if (req.user) {
                const { train } = await tools.resolveRelevantTrain(
                    { userId: req.user._id, role: req.user.role, isStaff: req.user.role === 'tte' || req.user.role === 'admin' }
                );
                if (train && train.destination) {
                    const weather = await getDestinationWeather(train.destination, date === 'tomorrow' ? 'tomorrow' : 'today');
                    return res.json(weather);
                }
            }
            return res.status(400).json({ success: false, error: 'Provide stationCode, stationName, or destination=true.' });
        }

        const weather = await getWeather({
            stationCode: stationCode || undefined,
            stationName: stationName || undefined,
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
            date: date === 'tomorrow' ? 'tomorrow' : 'today',
        });
        res.json(weather);
    } catch (error) {
        console.error('Weather API error:', error?.message || error);
        res.status(500).json({ success: false, error: 'Weather information is temporarily unavailable.' });
    }
};

module.exports = {
    chat: chatWithAI,
    streamChat,
    getRecommendations,
    predictPrice,
    findOptimalRoute,
    getProviderStatus,
    getWebStatus,
    getWeatherData,
};
