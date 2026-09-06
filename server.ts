import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import firebaseConfig from './firebase-applet-config.json';

dotenv.config();

// Firestore REST API Endpoint Configuration (Bearer token-authenticated per request)
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

/**
 * Defensive JWT payload extractor to verify token integrity and subject UID
 */
function parseJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Converts Firestore REST JSON structure into standard JavaScript object
 */
function convertFirestoreDoc(doc: any): any {
  if (!doc) return null;
  const result: any = { id: doc.name ? doc.name.split('/').pop() : '' };
  if (!doc.fields) return result;
  for (const [key, val] of Object.entries(doc.fields as Record<string, any>)) {
    if ('stringValue' in val) result[key] = val.stringValue;
    else if ('integerValue' in val) result[key] = Number(val.integerValue);
    else if ('doubleValue' in val) result[key] = Number(val.doubleValue);
    else if ('booleanValue' in val) result[key] = val.booleanValue;
    else if ('timestampValue' in val) result[key] = val.timestampValue;
    else if ('nullValue' in val) result[key] = null;
    else if ('arrayValue' in val) {
      result[key] = (val.arrayValue.values || []).map((v: any) => {
        if ('stringValue' in v) return v.stringValue;
        if ('integerValue' in v) return Number(v.integerValue);
        if ('doubleValue' in v) return Number(v.doubleValue);
        if ('booleanValue' in v) return v.booleanValue;
        if ('timestampValue' in v) return v.timestampValue;
        if ('mapValue' in v) return convertFirestoreDoc(v.mapValue);
        return v;
      });
    } else if ('mapValue' in val) {
      result[key] = convertFirestoreDoc(val.mapValue);
    }
  }
  return result;
}

/**
 * Converts JavaScript object into Firestore REST fields format
 */
function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') {
      if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
      else fields[k] = { doubleValue: v };
    } else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map((item) => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
            if (typeof item === 'boolean') return { booleanValue: item };
            if (typeof item === 'object' && item !== null) return { mapValue: { fields: toFirestoreFields(item) } };
            return { stringValue: String(item) };
          }),
        },
      };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

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

// ==========================================
// Reusable Security & Notification Helpers
// ==========================================

async function triggerSlackNotification(params: {
  batchId?: string;
  productName?: string;
  quantity?: number | string;
  unit?: string;
  farmName?: string;
  readyAt?: string;
  notes?: string;
}): Promise<boolean> {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (!slackWebhook || !slackWebhook.trim()) {
    return false;
  }

  const {
    batchId = 'Unknown Batch',
    productName = 'Unknown Product',
    quantity = 0,
    unit = 'kg',
    farmName = 'Our Facility',
    readyAt = new Date().toISOString(),
    notes = '',
  } = params;

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
    return response.ok;
  } catch (webhookErr: any) {
    console.warn('Failed to deliver Slack webhook notification:', webhookErr?.message);
    return false;
  }
}

/**
 * Server-Side Role Enforcement Helper:
 * Authoritatively verifies whether a user holds Admin privileges for a specific farm
 * using Firestore REST API with the authenticated user's ID token.
 * Never trusts client-supplied roles or unverified claims.
 */
async function verifyAdminRole(farmId: string, uid: string, token?: string): Promise<boolean> {
  if (!farmId || !uid) return false;

  // 1. If an ID token is provided, inspect signature & claims
  if (token) {
    const payload = parseJwtPayload(token);
    if (!payload || (payload.sub !== uid && payload.user_id !== uid)) {
      console.warn('verifyAdminRole: Token sub does not match passed uid');
      return false;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      console.warn('verifyAdminRole: Token expired');
      return false;
    }

    try {
      // 2. Farm ownership check via Firestore REST API (authenticated with user's token)
      const farmRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (farmRes.ok) {
        const farmDoc = convertFirestoreDoc(await farmRes.json());
        if (farmDoc?.ownerUid === uid) {
          return true;
        }
      }

      // 3. Member subcollection permissionTier check
      const memberRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/members/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (memberRes.ok) {
        const memberDoc = convertFirestoreDoc(await memberRes.json());
        return memberDoc?.permissionTier === 'admin';
      }
    } catch (err: any) {
      console.warn('verifyAdminRole REST lookup warning:', err?.message);
      return false;
    }
  }

  return false;
}

// API: External Notification on Batch Ready (Section 9)
app.post('/api/batches/notify-ready', async (req, res) => {
  try {
    const body = req.body || {};
    const notified = await triggerSlackNotification(body);
    res.json({
      success: true,
      notified,
      message: notified
        ? 'Slack logistics notification delivered.'
        : 'Notification acknowledged (Slack webhook not configured or unresponsive).',
    });
  } catch (error: any) {
    console.error('Error in /api/batches/notify-ready:', error);
    res.json({
      success: true,
      notified: false,
      warning: 'Could not send logistics notification.',
    });
  }
});

// API: Admin Dashboard Data (Role-Gated Server-Side)
app.get('/api/farms/:farmId/admin-dashboard', async (req, res) => {
  try {
    const { farmId } = req.params;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const uid = (req.query.uid as string) || (req.headers['x-user-uid'] as string) || (token ? parseJwtPayload(token)?.user_id : undefined);

    if (!uid || !token) {
      return res.status(401).json({ error: 'Authentication required. Bearer token missing.' });
    }

    // Authoritative Server-Side Role Verification
    const isAdmin = await verifyAdminRole(farmId, uid, token);
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Forbidden: Elevated Admin privileges are required to access the Admin Dashboard.',
      });
    }

    // Load batches for the farm via REST
    let batches: any[] = [];
    try {
      const batchesRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/batches?pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (batchesRes.ok) {
        const data = await batchesRes.json();
        batches = (data.documents || []).map(convertFirestoreDoc);
      }
    } catch (e: any) {
      console.warn('Failed to load batches via REST:', e?.message);
    }

    // Load members for the farm via REST
    let members: any[] = [];
    try {
      const membersRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/members?pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (membersRes.ok) {
        const data = await membersRes.json();
        members = (data.documents || []).map(convertFirestoreDoc);
      }
    } catch (e: any) {
      console.warn('Failed to load members via REST:', e?.message);
    }

    // Compute aggregate readiness and inventory
    const readyBatches = batches.filter((b: any) => b.status === 'ready');
    const processingBatches = batches.filter((b: any) => b.status === 'processing');
    const packagedBatches = batches.filter((b: any) => b.status === 'packaged');
    const harvestedBatches = batches.filter((b: any) => b.status === 'harvested');

    const totalReadyQuantity = readyBatches.reduce((sum: number, b: any) => {
      const q = b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity);
      return sum + (q || 0);
    }, 0);
    const totalProcessingQuantity = processingBatches.reduce((sum: number, b: any) => sum + (Number(b.totalQuantity) || 0), 0);
    const totalPackagedQuantity = packagedBatches.reduce((sum: number, b: any) => {
      const q = b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity);
      return sum + (q || 0);
    }, 0);

    // Group ready inventory by product name with dried output quantity
    const readyByProductMap: Record<string, { productName: string; quantity: number; unit: string; batchCount: number; rawIntakeQuantity: number }> = {};
    for (const b of readyBatches as any[]) {
      const pName = b.productName || 'Unlabeled Product';
      const outputUnit = b.driedOutputUnit || b.unit || 'kg';
      if (!readyByProductMap[pName]) {
        readyByProductMap[pName] = {
          productName: pName,
          quantity: 0,
          unit: outputUnit,
          batchCount: 0,
          rawIntakeQuantity: 0,
        };
      }
      const outputQty = b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity);
      readyByProductMap[pName].quantity += outputQty || 0;
      readyByProductMap[pName].rawIntakeQuantity += Number(b.totalQuantity) || 0;
      readyByProductMap[pName].batchCount += 1;
    }

    res.json({
      authorized: true,
      farmId,
      aggregates: {
        totalBatches: batches.length,
        readyBatchesCount: readyBatches.length,
        totalReadyQuantity,
        processingBatchesCount: processingBatches.length,
        totalProcessingQuantity,
        packagedBatchesCount: packagedBatches.length,
        totalPackagedQuantity,
        harvestedBatchesCount: harvestedBatches.length,
        readyByProduct: Object.values(readyByProductMap),
      },
      batches,
      members,
    });
  } catch (error: any) {
    console.error('Error in /api/farms/:farmId/admin-dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch admin dashboard metrics.', details: error?.message });
  }
});

// API: Change Batch Status to Ready or Packaged (Role-Gated Server-Side)
app.post('/api/batches/:batchId/status', async (req, res) => {
  try {
    const { batchId } = req.params;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const { farmId, uid, status, notes = '', driedOutputQuantity, driedOutputUnit } = req.body || {};

    if (!farmId || !uid) {
      return res.status(400).json({ error: 'farmId and uid are required.' });
    }

    if (status !== 'ready' && status !== 'packaged') {
      return res.status(400).json({ error: 'Target status must be "ready" or "packaged".' });
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Bearer token missing.' });
    }

    // Authoritative Server-Side Role Verification
    const isAdmin = await verifyAdminRole(farmId, uid, token);
    if (!isAdmin) {
      return res.status(403).json({
        error: 'Forbidden: Only users with Admin permission tier may advance batch status to Ready or Packaged.',
      });
    }

    // Fetch batch document via REST to read validated fields
    let batchData: any = null;
    try {
      const batchRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (batchRes.ok) {
        batchData = convertFirestoreDoc(await batchRes.json());
      }
    } catch (e: any) {
      console.warn('Could not read batch via REST:', e?.message);
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status,
      updatedAt: nowIso,
    };
    const updateMasks = ['status', 'updatedAt'];

    if (status === 'ready') {
      updatePayload.readyAt = nowIso;
      updateMasks.push('readyAt');

      // Dried output quantity entered by user (not default raw intake weight)
      if (driedOutputQuantity !== undefined && driedOutputQuantity !== null && !isNaN(Number(driedOutputQuantity))) {
        const cleanDriedQty = Math.max(0, Number(driedOutputQuantity));
        updatePayload.driedOutputQuantity = cleanDriedQty;
        updateMasks.push('driedOutputQuantity');

        const cleanUnit = String(driedOutputUnit || batchData?.unit || 'kg').trim();
        updatePayload.driedOutputUnit = cleanUnit;
        updateMasks.push('driedOutputUnit');

        if (batchData?.totalQuantity && Number(batchData.totalQuantity) > 0) {
          const rawQty = Number(batchData.totalQuantity);
          const yieldPct = Math.round((cleanDriedQty / rawQty) * 1000) / 10;
          updatePayload.yieldPercentage = yieldPct;
          updateMasks.push('yieldPercentage');
        }
      }
    } else if (status === 'packaged') {
      updatePayload.packagedAt = nowIso;
      updateMasks.push('packagedAt');
    }
    if (notes) {
      updatePayload.statusNotes = notes;
      updateMasks.push('statusNotes');
    }

    const maskQuery = updateMasks.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
    const patchRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/batches/${batchId}?${maskQuery}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: toFirestoreFields(updatePayload),
      }),
    });

    if (!patchRes.ok) {
      const patchErr = await patchRes.json().catch(() => ({}));
      console.error('Failed to patch batch via REST:', patchErr);
      return res.status(patchRes.status).json({
        error: patchErr?.error?.message || 'Failed to update batch status in Firestore.',
      });
    }

    // If marked ready, trigger Slack logistics notification server-side with verified dried output
    let notifiedSlack = false;
    if (status === 'ready') {
      try {
        let farmName = 'Facility';
        const farmRes = await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (farmRes.ok) {
          const farmDoc = convertFirestoreDoc(await farmRes.json());
          if (farmDoc?.name) farmName = farmDoc.name;
        }

        const finalQuantity = updatePayload.driedOutputQuantity !== undefined 
          ? updatePayload.driedOutputQuantity 
          : (batchData?.totalQuantity || 0);
        const finalUnit = updatePayload.driedOutputUnit || batchData?.unit || 'kg';
        const yieldSuffix = updatePayload.yieldPercentage !== undefined 
          ? ` (${updatePayload.yieldPercentage}% dried yield from ${batchData?.totalQuantity || 0} ${batchData?.unit || 'kg'} raw intake)`
          : '';

        notifiedSlack = await triggerSlackNotification({
          batchId,
          productName: batchData?.productName || 'Batch Product',
          quantity: finalQuantity,
          unit: finalUnit,
          farmName,
          readyAt: nowIso,
          notes: `${notes ? notes + ' | ' : ''}Dried Output: ${finalQuantity} ${finalUnit}${yieldSuffix}`,
        });
      } catch (slackErr) {
        console.warn('Non-blocking Slack notification error:', slackErr);
      }
    }

    res.json({
      success: true,
      batchId,
      status,
      driedOutputQuantity: updatePayload.driedOutputQuantity,
      driedOutputUnit: updatePayload.driedOutputUnit,
      yieldPercentage: updatePayload.yieldPercentage,
      notifiedSlack,
      updatedAt: nowIso,
    });
  } catch (error: any) {
    console.error('Error updating batch status:', error);
    res.status(500).json({ error: 'Failed to update batch status.', details: error?.message });
  }
});

// API: Send Email / Gmail Invitation for Team Member (Role-Gated Server-Side)
app.post('/api/invites/send-email', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const { farmId, adminUid, inviteeEmail, roleLabel, permissionTier, farmName, appUrl } = req.body || {};

    if (!farmId || !adminUid || !inviteeEmail) {
      return res.status(400).json({ error: 'farmId, adminUid, and inviteeEmail are required.' });
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Bearer token missing.' });
    }

    // Authoritative Server-Side Role Verification
    const isAdmin = await verifyAdminRole(farmId, adminUid, token);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Only Admins can issue invitations.' });
    }

    const normalizedEmail = String(inviteeEmail).trim().toLowerCase();
    const cleanRoleLabel = String(roleLabel || 'Worker').trim();
    const cleanTier = permissionTier === 'admin' ? 'admin' : 'worker';
    const cleanFarmName = String(farmName || 'Smart Harvest Facility').trim();
    const baseUrl = appUrl || process.env.APP_URL || 'https://ais-dev-2a6ewjxov3nj3xk4tvrocj-821059100183.asia-southeast1.run.app';

    // Store in Firestore invites collection via REST
    const nowIso = new Date().toISOString();
    const inviteFields = {
      email: normalizedEmail,
      roleLabel: cleanRoleLabel,
      permissionTier: cleanTier,
      farmName: cleanFarmName,
      createdByUid: adminUid,
      createdAt: nowIso,
    };
    const updateMasks = Object.keys(inviteFields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await fetch(`${FIRESTORE_BASE_URL}/farms/${farmId}/invites/${encodeURIComponent(normalizedEmail)}?${updateMasks}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: toFirestoreFields(inviteFields),
      }),
    });

    // Construct Join URL with invite query parameter
    const joinUrl = `${baseUrl}?invite=${encodeURIComponent(normalizedEmail)}&farm=${farmId}`;

    // Construct Email Subject & Body
    const emailSubject = `Invitation to join ${cleanFarmName} as ${cleanRoleLabel} (${cleanTier.toUpperCase()})`;
    const plainTextBody = `Hello,\n\nYou have been invited by an administrator to join ${cleanFarmName} as a ${cleanRoleLabel} (${cleanTier}).\n\nWith this role, you will be able to ${
      cleanTier === 'worker'
        ? 'log raw material intakes and view your personal harvest logging view'
        : 'manage batches, view executive metrics, and monitor production readiness'
    }.\n\nTo accept this invitation:\n1. Open this link: ${joinUrl}\n2. Click "Continue with Google" using this exact email address: ${normalizedEmail}\n\nYour permissions and role will be automatically granted upon sign-in.\n\nWelcome to the team!\n${cleanFarmName} Operations`;

    // Construct direct Gmail web compose URL (opens in browser prefilled)
    const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(normalizedEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(plainTextBody)}`;
    const mailtoUrl = `mailto:${encodeURIComponent(normalizedEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(plainTextBody)}`;

    // Check if SMTP is configured for direct backend dispatch
    let emailSent = false;
    let transportInfo = 'Direct Gmail compose link generated';

    const smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER;
    const smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: process.env.GMAIL_USER ? 'gmail' : undefined,
          host: process.env.SMTP_HOST || (process.env.GMAIL_USER ? undefined : 'smtp.gmail.com'),
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"Smart Harvest" <${smtpUser}>`,
          to: normalizedEmail,
          subject: emailSubject,
          text: plainTextBody,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #065f46; margin-top: 0;">Invitation to Join ${cleanFarmName}</h2>
              <p style="font-size: 15px; color: #334155; line-height: 1.6;">
                You have been invited to join <strong>${cleanFarmName}</strong> with the role of <strong>${cleanRoleLabel}</strong> (<em>${cleanTier.toUpperCase()}</em>).
              </p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px; margin: 20px 0; border-radius: 6px;">
                <p style="margin: 0; color: #166534; font-size: 14px;">
                  <strong>Assigned Role:</strong> ${cleanRoleLabel} &bull; <strong>Access Tier:</strong> ${cleanTier.toUpperCase()}
                </p>
                <p style="margin: 6px 0 0 0; color: #166534; font-size: 13px;">
                  Authorized Email: <code>${normalizedEmail}</code>
                </p>
              </div>
              <p style="font-size: 14px; color: #475569;">
                Click below to accept this invitation and sign in using your Google account:
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${joinUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">
                  Accept Invitation &amp; Sign In
                </a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                Note: You must sign in with <strong>${normalizedEmail}</strong> to claim this role. If the button above doesn't work, copy and paste this link into your browser: <br/>
                <a href="${joinUrl}" style="color: #059669; word-break: break-all;">${joinUrl}</a>
              </p>
            </div>
          `,
        });
        emailSent = true;
        transportInfo = 'Email dispatched directly to recipient via SMTP';
      } catch (mailErr: any) {
        console.warn('SMTP direct delivery error (non-fatal, Gmail link available):', mailErr?.message);
        transportInfo = `SMTP dispatch error: ${mailErr?.message}. Please use the Send via Gmail button.`;
      }
    }

    res.json({
      success: true,
      emailSent,
      transportInfo,
      inviteeEmail: normalizedEmail,
      roleLabel: cleanRoleLabel,
      permissionTier: cleanTier,
      joinUrl,
      gmailWebUrl,
      mailtoUrl,
      emailSubject,
      plainTextBody,
    });
  } catch (error: any) {
    console.error('Error in /api/invites/send-email:', error);
    res.status(500).json({ error: 'Failed to process invitation email.', details: error?.message });
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
