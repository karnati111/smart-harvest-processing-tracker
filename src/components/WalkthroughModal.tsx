import React, { useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  X,
  ChevronRight,
  Shield,
  Bot,
  Boxes,
  Users,
  ClipboardList,
  Sparkles,
  Lock,
  Truck,
  Package,
  CreditCard,
} from 'lucide-react';

interface WalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ isOpen, onClose }) => {
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);

  if (!isOpen) return null;

  const testCases = [
    {
      id: 'TC-01',
      title: 'Google Sign-In & Zero-Password Identity',
      category: 'Authentication',
      icon: Lock,
      precondition: 'User visits the web application root URL.',
      steps: [
        'Observe the landing screen: only a single "Sign in with Google" entry point is presented (no manual registration forms, no email/password inputs).',
        'Click "Sign in with Google". Complete the Google OAuth popup with your account (e.g. bharathpypro@gmail.com).',
        'Verify that the Firebase Authentication token automatically supplies your verified email without any secondary verification steps.',
      ],
      expectedResult:
        'User is authenticated securely. If user has no existing facility membership, the Organization Setup modal appears immediately.',
    },
    {
      id: 'TC-02',
      title: 'Facility Creation & Name Collision Rejection',
      category: 'Onboarding & ABAC',
      icon: Shield,
      precondition: 'User is authenticated and opens Organization Setup.',
      steps: [
        'In the "Create New Facility" tab, type the name of an existing business (e.g. "Sunrise Dehydrated Botanicals").',
        'Click "Create Organization". Verify the application checks the reservation document in "farmNames" collection.',
        'Verify the exact error message appears: "A farm with this name already exists" and creation is blocked.',
        'Enter a fresh unique facility name (e.g. "Papad & Spice Artisan Mill #1") and click "Create Organization".',
        'Observe the confirmation banner: "You\'re now the admin of [Farm Name]." with the founding user bound as Admin.',
      ],
      expectedResult:
        'Unique facility created in Firestore with initial catalog items; user is assigned permissionTier="admin" with roleLabel="Admin".',
    },
    {
      id: 'TC-03',
      title: 'Team Invitations & Email-Gated Membership',
      category: 'Access Control',
      icon: Users,
      precondition: 'Signed in as Admin.',
      steps: [
        'Navigate to the "Team & Access" section.',
        'Enter an invitee Google email (e.g. coworker@gmail.com), select or enter a custom role label (e.g. "Supervisor" or "Packer"), and select "Worker Tier".',
        'Click "Send Invite". Verify the document is created under "farms/{farmId}/invites/{email}".',
        'When that coworker signs in with that exact Google email, open "Organization Setup" -> "Pending Invites".',
        'Click "Accept & Join". Confirm the new member record copies the tier and label strictly from the invite, with no self-assigned role privileges.',
      ],
      expectedResult:
        'Worker joins the facility with permissionTier="worker" and roleLabel="Supervisor". Security rules prevent privilege escalation.',
    },
    {
      id: 'TC-04',
      title: 'Dynamic Product Catalog (No Fixed Crops/Processes)',
      category: 'Catalog Management',
      icon: Boxes,
      precondition: 'Active in facility dashboard (Worker or Admin).',
      steps: [
        'Open the "Product Catalog" section.',
        'Click "+ Add Product". Enter a non-agricultural or artisan item, such as "Mango Pickle Mix", unit "kg", and processing type "fermenting".',
        'Save the product and verify it appears in the catalog grid with custom badges.',
        'Add a second product: "Papad Dough", unit "kg", processing type "drying".',
      ],
      expectedResult:
        'Products are saved to "farms/{farmId}/products" and instantly available across raw intake logs and batch creation.',
    },
    {
      id: 'TC-05',
      title: 'Raw Material Intake Logging',
      category: 'Operations',
      icon: ClipboardList,
      precondition: 'At least one product in catalog.',
      steps: [
        'Open the "Raw Material Intake" section.',
        'Click "Log Intake Entry". Select "Mango Pickle Mix", quantity "120", and enter delivery notes: "Fresh green mangoes, 15% salt pre-brine".',
        'Click "Save Intake Log".',
        'Verify the record appears in the intake table showing quantity, timestamp, and loggedBy with your role label.',
      ],
      expectedResult:
        'Intake record persisted under "farms/{farmId}/harvestLogs" with loggedByUid bound to authenticated user.',
    },
    {
      id: 'TC-06',
      title: 'Gemini 3.6 Flash AI Schedule Generation with Fallback Ladder',
      category: 'AI Engine',
      icon: Sparkles,
      precondition: 'Product created in catalog.',
      steps: [
        'Open the "Production Batches" section and click "New Production Batch".',
        'Select product "Mango Pickle Mix". Configure conditions: Temperature "Ambient 28°C", Humidity "60%", Method "Anaerobic ceramic crock fermentation", Duration "14 days".',
        'Click "Generate Schedule".',
        'Verify the server calls Gemini 3.6 Flash (with automated fallback ladder to 3.1-flash-lite/flash-latest).',
        'Review the generated schedule: process overview, monitoring intervals, critical control points, and readiness criteria.',
        'Click "Launch Production Batch".',
      ],
      expectedResult:
        'Batch is stored in Firestore with the full Gemini schedule and environmental conditions.',
    },
    {
      id: 'TC-07',
      title: 'Multi-Turn "Ask AI" Technical Batch Chat',
      category: 'AI Engine',
      icon: Bot,
      precondition: 'At least one batch created.',
      steps: [
        'On an active batch card, click "Ask AI".',
        'Click the suggestion chip: "Why is this temperature recommended for Mango Pickle Mix?"',
        'Verify Gemini responds using the batch conditions and schedule as context, and that both the user message and model response are stored in Firestore under "messages" subcollection.',
        'Type a follow-up: "What if ambient humidity rises significantly next week during fermentation?"',
        'Verify Gemini acknowledges the prior question and gives specific contingency adjustments for that batch.',
      ],
      expectedResult:
        'Real multi-turn conversation thread persisted in Firestore; subsequent questions maintain conversational memory.',
    },
    {
      id: 'TC-08',
      title: 'Worker vs Admin Attribute-Based Access Control (ABAC)',
      category: 'Security & Permissions',
      icon: Shield,
      precondition: 'Tested across Worker and Admin accounts.',
      steps: [
        'As a Worker: open an active batch card, expand details, and log a progress reading: Metric "Moisture: 14%", Note "Trays turned, aroma pungent". Verify reading is saved.',
        'As a Worker: attempt to mark the batch "Ready" or "Packaged". Verify the button is disabled or rejected by ABAC security rules.',
        'As an Admin: open the batch details. Click "Mark Ready".',
        'Verify the batch status transitions to "Ready for Distribution" and records readyAt timestamp.',
      ],
      expectedResult:
        'Workers are permitted only to add readings; status changes to "ready" or "packaged" are strictly restricted to Admins in both UI and Firestore rules.',
    },
    {
      id: 'TC-09',
      title: 'External Logistics Notification via Secret Manager / Env',
      category: 'Integrations',
      icon: Truck,
      precondition: 'Admin marks a batch "Ready".',
      steps: [
        'Admin clicks "Mark Ready" on an active batch.',
        'Server invokes /api/batches/notify-ready with server-validated fields (product name, quantity, facility name, timestamp).',
        'If SLACK_WEBHOOK_URL is configured, dispatch webhook; if not configured, safely handle non-blocking response without failing batch status.',
      ],
      expectedResult:
        'Webhook URL remains isolated server-side. Notification failure does not roll back the database transaction.',
    },
    {
      id: 'TC-10',
      title: 'Operational History & Dynamic Product Filter',
      category: 'Traceability',
      icon: BookOpenCheck,
      precondition: 'Multiple intake entries and batches recorded.',
      steps: [
        'Navigate to "Operational History".',
        'Switch between "Batches" and "Intakes" sub-tabs.',
        'Select a specific product in the product filter (e.g. "Mango Pickle Mix").',
        'Verify all displayed records dynamically filter to only that product.',
        'Search for specific terms in the search bar (e.g. "anaerobic", "Grade A").',
      ],
      expectedResult:
        'Instantaneous, responsive filtering of historical records by product and status.',
    },
    {
      id: 'TC-11',
      title: 'Grade Output at Mark Ready Stage (Grade A & Grade B Dried Weight)',
      category: 'Production Batches & QC',
      icon: Sparkles,
      precondition: 'An active batch is in "In Chamber Processing" status.',
      steps: [
        'As an Admin, navigate to "Production Batches" and locate an active batch.',
        'Click "Mark Ready for Distribution". The Grade Output & Dried Weight modal appears.',
        'Enter Grade A Output dried weight (e.g. "12.5" kg) and Grade B Output dried weight (e.g. "3.5" kg).',
        'Inspect the real-time calculated total dried output (16.0 kg) and yield recovery percentage.',
        'Enter optional QC Notes (e.g. "Top trays crisp and vibrant green, slight sun-spotting on lower racks sorted to Grade B").',
        'Click "Confirm & Transition to Ready".',
        'Verify the batch card header displays: Grade A: 12.5 kg, Grade B: 3.5 kg with custom grade tags.',
      ],
      expectedResult:
        'Batch status transitions to Ready with gradeAOutputQuantity and gradeBOutputQuantity safely persisted in Firestore.',
    },
    {
      id: 'TC-12',
      title: 'Packaging & Storage Module (Grade A & B Dried Stock & Gram-Sized Bags)',
      category: 'Packaging & Storage',
      icon: Package,
      precondition: 'At least one batch marked Ready with Grade A and Grade B output.',
      steps: [
        'Click the "Packaging & Storage" tab in the main navigation bar.',
        'Observe the top inventory overview cards: Total Available Dried Bulk Stock, Grade A Stock, Grade B Stock, and Finished Packaged Inventory.',
        'Review the Dried Bulk Stock by Grade summary cards showing exact available weight (in kg and grams) broken down by product.',
        'Click "+ Pack & Store Bags" or click "Pack This Grade" on a specific grade card.',
        'Select the Product (e.g. Moringa Leaves), choose the Grade ("Grade A" or "Grade B"), and enter the package size in grams (e.g. "100" grams or "250" grams).',
        'Enter the Number of Bags/Packages to pack (e.g. "50" bags).',
        'Verify the modal calculates the required bulk dried weight (5.00 kg / 5,000 g) and validates against available bulk stock.',
        'Select or enter the Storage Location / Bin ID (e.g. "Bin A-04 (Dehumidified Cold Room)") and click "Confirm & Store Packages".',
        'Observe the new record in the "Finished Goods & Storage Inventory" table with remaining units and dispatch action.',
      ],
      expectedResult:
        'Packaging record is stored under "farms/{farmId}/packagingLogs" with exact gram bag size, grade, barcode/SKU, and location metadata.',
    },
    {
      id: 'TC-13',
      title: 'Outbound Dispatching, Order Details & Payment Tracking',
      category: 'Dispatch & Logistics',
      icon: CreditCard,
      precondition: 'Stored packaged goods available in Packaging module.',
      steps: [
        'Click "Dispatching" in the navigation bar (or click "Dispatch Bags" directly from the Packaging module).',
        'Observe the Dispatch KPI metrics: Total Dispatched Orders, Total Gross Dispatch Value (₹), Amount Received / Collected (₹), and Pending / COD Receivable (₹).',
        'Click "+ New Dispatch Order".',
        'Enter Order Number (e.g. "ORD-2026-089") and select Where we got order / Source (e.g. "WhatsApp Direct", "B2B Distributor", "Shopify Store", "Amazon").',
        'Fill Customer & Destination Details: Customer Name ("Aarav Patel"), Phone ("+91 98200 44551"), Delivery Address ("Flat 402, Lotus Tower, SG Highway"), Destination City ("Ahmedabad"), and Pincode ("380054").',
        'In the "Dispatch Line Items" section, select the stored package item (e.g. "Moringa Leaves - Grade A [100g bags]"), specify units (e.g. "20" bags), and Unit Price (e.g. "₹180"). Verify total weight and subtotal calculate automatically.',
        'In "Payment & Settlement", choose Payment Status ("Prepaid" or "Amount Received"), enter Amount Received (e.g. "₹3,600"), and Payment Method ("UPI / Google Pay").',
        'Enter Courier Name ("Delhivery Express") and AWB Tracking Number ("DEL778899221").',
        'Click "Confirm & Generate Dispatch".',
        'Verify the order appears in the Dispatch Log table. Click "View Slip" to inspect the printable packing slip and delivery invoice.',
      ],
      expectedResult:
        'Dispatch record is stored in Firestore with all contact, destination, line-item, courier, and payment details.',
    },
  ];

  const currentCase = testCases[activeCaseIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Verification &amp; Test Walkthrough Specifications
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Executable step-by-step test cases for automated QA or manual verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Sidebar list + Detail panel */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Navigation: Test cases */}
          <div className="w-full md:w-72 bg-slate-50/80 dark:bg-slate-950/60 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-2 space-y-1">
            {testCases.map((tc, idx) => {
              const Icon = tc.icon;
              const isActive = activeCaseIndex === idx;
              return (
                <button
                  key={tc.id}
                  onClick={() => setActiveCaseIndex(idx)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition flex items-center justify-between ${
                    isActive
                      ? 'bg-emerald-600 text-white font-semibold shadow'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-emerald-500'}`} />
                    <div className="truncate">
                      <div className="text-[10px] opacity-80">{tc.id} • {tc.category}</div>
                      <div className="truncate">{tc.title}</div>
                    </div>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                </button>
              );
            })}
          </div>

          {/* Right Detail Pane */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white dark:bg-slate-900 text-xs">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold font-mono">
                  {currentCase.id}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  {currentCase.category}
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {currentCase.title}
              </h4>
            </div>

            {/* Preconditions */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                Pre-condition:
              </span>
              <p className="text-slate-600 dark:text-slate-400">{currentCase.precondition}</p>
            </div>

            {/* Test Steps */}
            <div className="space-y-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                Verification Steps:
              </span>
              <ol className="space-y-2 list-decimal list-inside text-slate-700 dark:text-slate-300">
                {currentCase.steps.map((step, sIdx) => (
                  <li key={sIdx} className="leading-relaxed pl-1">
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Expected Result */}
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center space-x-1.5 font-bold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Expected Functional Outcome:</span>
              </div>
              <p className="leading-relaxed text-xs">{currentCase.expectedResult}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs text-slate-500">
          <span>10 of 10 automated/manual test cases documented</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 text-white hover:bg-slate-700 rounded-lg transition font-medium"
          >
            Close Walkthrough
          </button>
        </div>
      </div>
    </div>
  );
};
