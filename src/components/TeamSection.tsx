import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { FarmMember, FarmInvite, PermissionTier } from '../types';
import { getFarmMembers, getFarmInvites, createInvite } from '../lib/farmService';
import {
  Users,
  UserPlus,
  ShieldCheck,
  UserCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ShieldAlert,
  BellRing,
  Send,
} from 'lucide-react';

interface TeamSectionProps {
  farmId: string;
  user: User;
  member: FarmMember;
}

export const TeamSection: React.FC<TeamSectionProps> = ({ farmId, user, member }) => {
  const [members, setMembers] = useState<FarmMember[]>([]);
  const [invites, setInvites] = useState<FarmInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Slack webhook status & test state
  const [slackConfigured, setSlackConfigured] = useState<boolean | null>(null);
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackResult, setSlackResult] = useState<{ success: boolean; message: string } | null>(null);

  // Invite form state (Admin only)
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [roleLabel, setRoleLabel] = useState('Supervisor');
  const [permissionTier, setPermissionTier] = useState<PermissionTier>('worker');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = member.permissionTier === 'admin';

  useEffect(() => {
    loadTeamData();
    checkSlackStatus();
  }, [farmId]);

  const checkSlackStatus = async () => {
    try {
      const res = await fetch('/api/slack/status');
      if (res.ok) {
        const data = await res.json();
        setSlackConfigured(Boolean(data.configured));
      }
    } catch {
      setSlackConfigured(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setSlackResult(null);
    try {
      const res = await fetch('/api/batches/notify-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: `TEST-${Date.now().toString().slice(-4)}`,
          productName: 'Verification Sample (Moringa / Pickle Mix)',
          quantity: 25,
          unit: 'kg',
          farmName: 'Smart Harvest Production Facility',
          readyAt: new Date().toISOString(),
          notes: 'Automated Slack Webhook Healthcheck from Team Dashboard',
        }),
      });
      const data = await res.json();
      if (data.notified) {
        setSlackResult({
          success: true,
          message: 'Webhook test passed! Slack received the payload successfully (HTTP 200).',
        });
      } else {
        setSlackResult({
          success: false,
          message: data.warning || 'Slack webhook did not deliver (URL may be missing or unconfigured).',
        });
      }
    } catch (err: any) {
      setSlackResult({
        success: false,
        message: err?.message || 'Failed to reach backend notification endpoint.',
      });
    } finally {
      setTestingSlack(false);
    }
  };

  const loadTeamData = async () => {
    setIsLoading(true);
    try {
      const [membersData, invitesData] = await Promise.all([
        getFarmMembers(farmId),
        isAdmin ? getFarmInvites(farmId) : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setInvites(invitesData);
    } catch (err) {
      console.error('Error loading team data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFeedback(null);

    const email = inviteeEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await createInvite(farmId, email, roleLabel, permissionTier, user.uid);
      setFeedback({
        type: 'success',
        message: `Invitation issued for ${email} as ${roleLabel} (${permissionTier}). Next time they sign in with Google using that email, their role will be automatically granted.`,
      });
      setInviteeEmail('');
      loadTeamData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to issue invitation.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const commonRoleLabels = [
    'Supervisor',
    'Packer',
    'Field Worker',
    'Distributor',
    'Quality Inspector',
    'Production Lead',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-emerald-500" />
            <span>Team &amp; Access Control</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Attribute-Based Access Control (ABAC) with email-gated memberships
          </p>
        </div>
        <div className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          Your Tier: <span className="uppercase text-emerald-600 dark:text-emerald-400">{member.permissionTier}</span>
        </div>
      </div>

      {/* Admin Invite Form */}
      {isAdmin ? (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <UserPlus className="w-4 h-4 text-emerald-500" />
            <span>Invite New Team Member</span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSendInvite} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Email Address */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Google Account Email
                </label>
                <input
                  type="email"
                  placeholder="collaborator@example.com"
                  value={inviteeEmail}
                  onChange={(e) => setInviteeEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Free-Text Role Label */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Custom Role Label (Display)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Supervisor, Packer, Field Worker"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {commonRoleLabels.map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setRoleLabel(lbl)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                        roleLabel === lbl
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission Tier */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Enforced Security Tier
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-2 rounded-lg border text-center cursor-pointer transition ${
                      permissionTier === 'worker'
                        ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-500 text-sky-800 dark:text-sky-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value="worker"
                      checked={permissionTier === 'worker'}
                      onChange={() => setPermissionTier('worker')}
                      className="sr-only"
                    />
                    <div>Worker Tier</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">Logs &amp; Readings</div>
                  </label>

                  <label
                    className={`p-2 rounded-lg border text-center cursor-pointer transition ${
                      permissionTier === 'admin'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value="admin"
                      checked={permissionTier === 'admin'}
                      onChange={() => setPermissionTier('admin')}
                      className="sr-only"
                    />
                    <div>Admin Tier</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">Full Authority</div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 max-w-lg">
                * The invite is keyed directly to the invitee's email. Their tier and role label come strictly from this invite, and cannot be self-assigned.
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !inviteeEmail.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow transition flex items-center space-x-1.5 shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Issuing Invite...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Invite</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center space-x-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            You are operating under the <strong>Worker</strong> permission tier ({member.roleLabel}). Only facility Admins can issue invitations or manage organization access.
          </span>
        </div>
      )}

      {/* Active Team Members List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Users className="w-4 h-4 text-emerald-500" />
            <span>Active Team Members ({members.length})</span>
          </h3>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center items-center text-slate-400 space-x-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            <span>Loading team members...</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {members.map((m) => (
              <div
                key={m.uid}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 uppercase">
                    {(m.email || 'U')[0]}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {m.email}
                    </span>
                    {m.uid === user.uid && (
                      <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        (You)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 font-medium">
                    Role: {m.roleLabel || (m.permissionTier === 'admin' ? 'Admin' : 'Worker')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded uppercase font-mono text-[10px] font-bold ${
                      m.permissionTier === 'admin'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                    }`}
                  >
                    {m.permissionTier}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logistics & Slack Webhook Notification Card */}
      <div id="slack-integration-card" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-200 dark:border-emerald-800">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Logistics & Distribution Alerts (Slack Webhook)
                </h3>
                {slackConfigured === true && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Connected & Active
                  </span>
                )}
                {slackConfigured === false && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    Not Configured
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                When an admin marks a production batch as <strong>"Ready"</strong>, a sanitized notification is automatically dispatched server-side to your logistics channel with product specs, quantity, and timestamp.
              </p>
            </div>
          </div>

          <button
            id="test-slack-webhook-btn"
            type="button"
            onClick={handleTestSlack}
            disabled={testingSlack}
            className="inline-flex items-center justify-center space-x-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-300 dark:border-slate-700 shrink-0 disabled:opacity-60"
          >
            {testingSlack ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                <span>Dispatching Test...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-emerald-500" />
                <span>Test Webhook</span>
              </>
            )}
          </button>
        </div>

        {slackResult && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center space-x-2.5 border ${
              slackResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
            }`}
          >
            {slackResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span className="font-medium">{slackResult.message}</span>
          </div>
        )}
      </div>

      {/* Pending Invitations (Admin only) */}
      {isAdmin && invites.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Pending Invitations ({invites.length})</span>
            </h3>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {invites.map((inv) => (
              <div
                key={inv.email}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{inv.email}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Assigned: <strong className="text-slate-700 dark:text-slate-300">{inv.roleLabel}</strong> ({inv.permissionTier})
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 self-start sm:self-auto">
                  Awaiting Google Sign-In
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
