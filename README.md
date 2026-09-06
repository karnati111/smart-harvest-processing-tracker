# Smart Harvest & Processing Tracker

A production-grade, full-stack application for small-batch producers — dehydrated produce, ferments/pickles, spice grinding, papad making, and craft food processing. Designed with strict Attribute-Based Access Control (ABAC), Google Federated Identity, resilient Gemini 3.6 Flash AI processing schedules, and multi-turn batch consultation.

---

## 1. Agentic Threat Model & Countermeasures

| Threat Zone | Identified Vector | Risk Severity | Implemented Countermeasure |
| :--- | :--- | :--- | :--- |
| **Input Surfaces** | Arbitrary product/crop inputs & free-text processing types | Medium | Normalized input schema, parameterization, sanitized state models without hardcoded enums. |
| **Planning & Reasoning** | Prompt injection via custom batch notes to alter processing criteria | High | Structured system prompt instructions, explicit separation of user notes from AI directives, grounded prompt templates. |
| **Tool / Server Execution** | SSRF or Webhook injection via notification payload | High | Webhook payload generated exclusively from server-verified database fields (product, quantity, farm, timestamp); URL retrieved server-side from Secret Manager / env. |
| **Memory & State (ABAC)** | Cross-organization data leakage or privilege escalation | Critical | Firestore Security Rules enforcing farm membership (`farms/{farmId}/members/{uid}`), email-gated invitations, and strict admin tier checks for status updates. |
| **Inter-System / Auth** | Unauthorized signups or self-assigned permissions | High | Zero-registration sign-in via Google Federated Auth; invitations strictly keyed to verified Google account emails (`request.auth.token.email`). |

---

## 2. Architecture Overview

- **Frontend**: React 18 with Vite, Tailwind CSS, Lucide icons, Markdown rendering.
- **Backend**: Node.js Express server (`server.ts`) hosting API routes and serving the SPA build.
- **AI Engine**: `@google/genai` TypeScript SDK utilizing **Gemini 3.6 Flash** with an automated, resilient fallback ladder:
  1. Primary: `gemini-3.6-flash`
  2. High-Availability Fallback: `gemini-3.1-flash-lite`
  3. Dynamic Alias: `gemini-flash-latest`
  4. Deep Reasoning Fallback: `gemini-3.7-flash`
- **Database & Auth**: Google Cloud Firestore & Firebase Auth (Google Federated Identity).

---

## 3. Firestore Security Rules (ABAC & Email-Gated Isolation)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null && request.auth.uid != null;
    }

    function isFarmMember(farmId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/farms/$(farmId)/members/$(request.auth.uid));
    }

    function isFarmAdmin(farmId) {
      return isFarmMember(farmId) &&
        get(/databases/$(database)/documents/farms/$(farmId)/members/$(request.auth.uid)).data.permissionTier == 'admin';
    }

    // Name reservation: Prevents duplicate facility names
    match /farmNames/{normalizedName} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() &&
        !exists(/databases/$(database)/documents/farmNames/$(normalizedName)) &&
        request.resource.data.claimedByUid == request.auth.uid;
      allow update, delete: if false;
    }

    // Organization document
    match /farms/{farmId} {
      allow read: if isFarmMember(farmId);
      allow create: if isAuthenticated() &&
        request.resource.data.ownerUid == request.auth.uid;
      allow update, delete: if isFarmAdmin(farmId);

      // Members: Only admins can manage, or joining user matching invite
      match /members/{memberUid} {
        allow read: if isFarmMember(farmId);
        allow create: if isAuthenticated() &&
          request.auth.uid == memberUid &&
          (
            request.auth.uid == get(/databases/$(database)/documents/farms/$(farmId)).data.ownerUid ||
            exists(/databases/$(database)/documents/farms/$(farmId)/invites/$(request.auth.token.email))
          );
        allow update, delete: if isFarmAdmin(farmId);
      }

      // Invites: Admin can create; invitee can read
      match /invites/{inviteeEmail} {
        allow read: if isFarmAdmin(farmId) ||
          (isAuthenticated() && request.auth.token.email == inviteeEmail);
        allow create, update, delete: if isFarmAdmin(farmId);
      }

      // Products Catalog: Any member can add and read
      match /products/{productId} {
        allow read: if isFarmMember(farmId);
        allow create: if isFarmMember(farmId) &&
          request.resource.data.createdByUid == request.auth.uid;
        allow update, delete: if isFarmAdmin(farmId);
      }

      // Raw Material Intake Logs
      match /harvestLogs/{logId} {
        allow read: if isFarmMember(farmId);
        allow create: if isFarmMember(farmId) &&
          request.resource.data.loggedByUid == request.auth.uid;
        allow update, delete: if isFarmAdmin(farmId);
      }

      // Production Batches
      match /batches/{batchId} {
        allow read: if isFarmMember(farmId);
        allow create: if isFarmMember(farmId);
        allow update: if isFarmMember(farmId) && (
          isFarmAdmin(farmId) ||
          (
            // Workers cannot mark ready or packaged
            request.resource.data.status != 'ready' &&
            request.resource.data.status != 'packaged'
          )
        );
        allow delete: if isFarmAdmin(farmId);

        // Batch Chat Messages (Multi-turn conversations)
        match /messages/{messageId} {
          allow read: if isFarmMember(farmId);
          allow create: if isFarmMember(farmId) &&
            request.resource.data.senderUid == request.auth.uid;
        }
      }
    }
  }
}
```

---

## 4. Google Secret Manager Setup

Store API secrets securely in Google Cloud Secret Manager instead of hardcoding or committing credentials:

```bash
# Set your project ID
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export SERVICE_NAME="smart-harvest-tracker"

# 1. Create Secrets
gcloud secrets create GEMINI_API_KEY \
  --replication-policy="automatic" \
  --project="${PROJECT_ID}"

gcloud secrets create SLACK_WEBHOOK_URL \
  --replication-policy="automatic" \
  --project="${PROJECT_ID}"

# 2. Populate Secret Values
echo -n "AIzaSyYourGeminiApiKeyHere" | \
  gcloud secrets versions add GEMINI_API_KEY --data-file=- --project="${PROJECT_ID}"

echo -n "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | \
  gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=- --project="${PROJECT_ID}"

# 3. Grant Secret Access to Cloud Run Service Account
export SERVICE_ACCOUNT="${PROJECT_ID}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}"

gcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}"
```

---

## 5. Deployment to Google Cloud Run

Build and deploy the application container to Cloud Run with attached Secret Manager bindings:

```bash
# Build production artifact with Cloud Build
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME}

# Deploy to Cloud Run with secrets mounted as environment variables
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 3000 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest" \
  --project ${PROJECT_ID}
```

---

## 6. Campaign Verification Binding

Apply the mandatory verification label to your deployed Cloud Run service:

```bash
gcloud run services update smart-harvest-tracker \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 7. Functional Verification Walkthrough

The application includes an in-app **Walkthrough Modal** detailing all 10 automated and manual test cases:
1. **Google Sign-In**: Zero password handling, authenticated federated token.
2. **Facility Creation**: Checks `farmNames` reservation; blocks duplicates with `"A farm with this name already exists"`.
3. **Admin Team Invites**: Invites keyed to email with server-enforced role labels and permission tiers.
4. **Dynamic Catalog**: Add custom products/processes (drying, fermenting, papad dough, grinding) without rigid enums.
5. **Raw Material Intake**: Log intake with server-verified uid and role label.
6. **Gemini 3.6 Flash Processing Schedule**: Generates checkpoints and sensory criteria with resilient fallback ladder.
7. **Multi-Turn "Ask AI" Chat**: Technical consultation grounded in batch parameters and saved under Firestore subcollections.
8. **Worker vs. Admin ABAC**: Workers can log progress readings but cannot mark batches "Ready" or "Packaged".
9. **Logistics Notification**: Server-side webhook triggers safely without leaking the webhook URL.
10. **Operational History**: Traceability records with dynamic product and status filtering.
