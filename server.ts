import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Standard Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Resilient Model Fallback Ladder
const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

// Lazy initialization of GoogleGenAI client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY environment variable is not set; requests may fail.');
    }
    genAIClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return genAIClient;
}

// Resilient content generator attempting models in fallback ladder
async function generateContentWithFallback(
  params: {
    contents: any;
    systemInstruction?: string;
  }
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGenAI();
  let lastError: any = null;

  for (const model of MODEL_FALLBACK_LADDER) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.systemInstruction
          ? { systemInstruction: params.systemInstruction }
          : undefined,
      });

      const text = response.text || '';
      return { text, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || '';
      const message = err?.message || String(err);
      console.warn(`Model ${model} failed (status: ${status}, error: ${message}). Falling back to next model...`);
      // Continue to next model in fallback ladder
    }
  }

  throw new Error(`All Gemini models in the fallback ladder failed. Last error: ${lastError?.message || lastError}`);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    slackWebhookConfigured: !!process.env.SLACK_WEBHOOK_URL,
  });
});

// API: Generate Production Schedule & Target Completion Criteria
app.post('/api/batches/generate-schedule', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      productName = 'Raw Material',
      processingType = 'processing',
      conditions = {},
    } = body;

    const {
      temperature = 'Ambient',
      humidity = 'Normal',
      method = 'Standard',
      duration = 'Standard time',
      targetCriteria = 'Standard moisture & texture',
      customNotes = '',
    } = conditions;

    const systemInstruction = `You are an expert production engineer and food/materials scientist specializing in small-batch artisan processing.
Your expertise spans diverse processing disciplines including dehydration/drying (moringa, flowers, herbs), fermentation & pickling (mango pickle, kimchi, fermented pastes), milling & grinding (turmeric, whole spices), and dough preparation/curing (papad dough, pasta, dough pressing).
Provide a structured, clear, and actionable production schedule and target completion criteria tailored specifically to the given product, processing type, and environmental conditions.
Format with clean headings, bullet points, numbered phases, and clear sensory/quality checkpoints.
Always provide realistic timeframes, temperature/humidity guidance, monitoring intervals, and measurable readiness criteria.`;

    const prompt = `Please generate a comprehensive, recommended production schedule and target completion criteria for the following small-batch processing run:

- Product Name: ${String(productName).slice(0, 100)}
- Processing Type: ${String(processingType).slice(0, 100)}
- Environmental & Process Conditions:
  * Operating Temperature: ${String(temperature).slice(0, 100)}
  * Humidity / Moisture Level: ${String(humidity).slice(0, 100)}
  * Processing Method / Equipment: ${String(method).slice(0, 100)}
  * Estimated / Target Duration: ${String(duration).slice(0, 100)}
  * Specific Quality Criteria: ${String(targetCriteria).slice(0, 150)}
  * Operational Notes: ${String(customNotes).slice(0, 300)}

Please include:
1. Executive Summary & Process Overview
2. Step-by-Step Schedule & Timeline (Phases, Action Steps, Monitoring Intervals)
3. Critical Control Points & Environmental Tolerances (What to watch for)
4. Target Completion & Readiness Criteria (Sensory, texture, moisture, shelf-life indicators)
5. Troubleshooting & Contingency Tips (e.g. if humidity spikes or temperature drops)`;

    const result = await generateContentWithFallback({
      contents: prompt,
      systemInstruction,
    });

    res.json({
      schedule: result.text,
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in /api/batches/generate-schedule:', error);
    res.status(500).json({
      error: 'Failed to generate production schedule.',
      details: error?.message || String(error),
    });
  }
});

// API: Multi-turn "Ask AI" Chat Panel for a specific batch
app.post('/api/batches/:batchId/chat', async (req, res) => {
  try {
    const { batchId } = req.params;
    const body = req.body || {};
    const {
      productName = 'Batch Product',
      processingType = 'processing',
      conditions = {},
      schedule = '',
      history = [],
      query = '',
    } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query string is required.' });
    }

    const systemInstruction = `You are the dedicated AI Quality & Process Assistant for Batch ID #${String(batchId).slice(0, 30)}.
Current Batch Specifications:
- Product: ${String(productName).slice(0, 100)}
- Processing Type: ${String(processingType).slice(0, 100)}
- Configured Conditions: Temperature: ${conditions.temperature || 'N/A'}, Humidity: ${conditions.humidity || 'N/A'}, Method: ${conditions.method || 'N/A'}, Duration: ${conditions.duration || 'N/A'}
- Current Schedule / Criteria:
${String(schedule).slice(0, 2000)}

You are engaged in an ongoing multi-turn technical conversation with the production team (admins, supervisors, and field workers).
Answer all questions with specific reference to this batch's parameters, environmental variables, and progress.
Keep your answers practical, safe, encouraging, and scientifically sound.`;

    // Construct multi-turn contents array
    const contents: any[] = [];

    // Add prior sanitized conversation turns
    if (Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg && msg.content) {
          contents.push({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(msg.content).slice(0, 2000) }],
          });
        }
      }
    }

    // Append latest query
    contents.push({
      role: 'user',
      parts: [{ text: String(query).trim().slice(0, 2000) }],
    });

    const result = await generateContentWithFallback({
      contents,
      systemInstruction,
    });

    res.json({
      reply: result.text,
      modelUsed: result.modelUsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in /api/batches/:batchId/chat:', error);
    res.status(500).json({
      error: 'Failed to process AI conversation turn.',
      details: error?.message || String(error),
    });
  }
});

// API: Check Slack Webhook integration status
app.get('/api/slack/status', (req, res) => {
  const isConfigured = Boolean(process.env.SLACK_WEBHOOK_URL && process.env.SLACK_WEBHOOK_URL.trim());
  res.json({
    configured: isConfigured,
    preview: isConfigured ? 'https://hooks.slack.com/services/...' : null,
  });
});

// API: External Notification on Batch Ready (Section 9)
app.post('/api/batches/notify-ready', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      batchId = 'Unknown Batch',
      productName = 'Unknown Product',
      quantity = 0,
      unit = 'kg',
      farmName = 'Our Facility',
      readyAt = new Date().toISOString(),
      notes = '',
    } = body;

    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhook) {
      // Non-blocking: Slack is not configured, acknowledge safely
      return res.json({
        success: true,
        notified: false,
        message: 'Batch marked ready. (Slack webhook not configured in environment, external notification skipped)',
      });
    }

    // Build payload strictly from validated fields (prevent injection)
    const payload = {
      text: `🚀 Batch Ready for Logistics: ${productName} (${quantity} ${unit}) at ${farmName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📦 Production Batch Ready for Distribution',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Facility / Business:*\n${String(farmName).slice(0, 100)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Product:*\n${String(productName).slice(0, 100)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Quantity:*\n${Number(quantity) || 0} ${String(unit).slice(0, 20)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Batch ID:*\n${String(batchId).slice(0, 50)}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Ready Timestamp:* ${new Date(readyAt).toLocaleString()} ${notes ? `| *Notes:* ${String(notes).slice(0, 200)}` : ''}`,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`Slack webhook returned status ${response.status}`);
        return res.json({
          success: true,
          notified: false,
          warning: `Slack returned HTTP ${response.status}`,
        });
      }

      return res.json({
        success: true,
        notified: true,
      });
    } catch (webhookErr: any) {
      console.warn('Failed to deliver Slack webhook notification:', webhookErr?.message);
      return res.json({
        success: true,
        notified: false,
        warning: 'Slack webhook connection error (non-blocking).',
      });
    }
  } catch (error: any) {
    console.error('Error in /api/batches/notify-ready:', error);
    // Non-blocking per Section 9
    res.json({
      success: true,
      notified: false,
      warning: 'Could not send logistics notification.',
    });
  }
});

// Vite Middleware & Static Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
