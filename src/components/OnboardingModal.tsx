import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Farm, FarmMember, FarmInvite } from '../types';
import {
  createFarm,
  getPendingInvitesForEmail,
  acceptInvite,
  isFarmNameTaken,
} from '../lib/farmService';
import {
  Building2,
  MailCheck,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Shield,
  UserCheck,
} from 'lucide-react';

interface OnboardingModalProps {
  user: User;
  isOpen: boolean;
  canCancel: boolean;
  onClose: () => void;
  onFarmSelected: (farm: Farm, member: FarmMember) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  isOpen,
  canCancel,
  onClose,
  onFarmSelected,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'invites'>('create');
  const [farmNameInput, setFarmNameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = useState<FarmInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [acceptingInviteFarmId, setAcceptingInviteFarmId] = useState<string | null>(null);

  // Fetch pending invites when modal opens
  useEffect(() => {
    if (isOpen && user.email) {
      loadPendingInvites();
    }
  }, [isOpen, user.email]);

  const loadPendingInvites = async () => {
    if (!user.email) return;
    setIsLoadingInvites(true);
    try {
      const invites = await getPendingInvitesForEmail(user.email);
      setPendingInvites(invites);
      if (invites.length > 0 && !farmNameInput) {
        setActiveTab('invites');
      }
    } catch (err) {
      console.warn('Could not load invites:', err);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  if (!isOpen) return null;

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmed = farmNameInput.trim();
    if (!trimmed) {
      setErrorMessage('Please enter an organization or facility name.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Check reservation
      const taken = await isFarmNameTaken(trimmed);
      if (taken) {
        setErrorMessage('A farm with this name already exists');
        setIsSubmitting(false);
        return;
      }

      // 2. Create farm & member
      const result = await createFarm(trimmed, user.uid, user.email || '');
      const successText = `You're now the admin of ${result.farmName}.`;
      setSuccessMessage(successText);

      // Construct immediate farm & member objects
      const newFarm: Farm = {
        id: result.farmId,
        name: result.farmName,
        ownerUid: user.uid,
      };
      const newMember: FarmMember = {
        uid: user.uid,
        email: user.email || '',
        permissionTier: 'admin',
        roleLabel: 'Admin',
      };

      setTimeout(() => {
        onFarmSelected(newFarm, newMember);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create organization. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvite = async (invite: FarmInvite) => {
    if (!invite.farmId || !user.email) return;
    setErrorMessage(null);
    setAcceptingInviteFarmId(invite.farmId);

    try {
      const newMember = await acceptInvite(invite.farmId, user.uid, user.email);
      const joinedFarm: Farm = {
        id: invite.farmId,
        name: invite.farmName || 'Facility',
        ownerUid: invite.createdByUid,
      };

      setSuccessMessage(`Welcome! You joined ${joinedFarm.name} as ${newMember.roleLabel} (${newMember.permissionTier}).`);
      setTimeout(() => {
        onFarmSelected(joinedFarm, newMember);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not accept invitation.');
    } finally {
      setAcceptingInviteFarmId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Organization Setup
              </h2>
              <p className="text-xs text-slate-400">
                Create your production business or accept a team invitation
              </p>
            </div>
          </div>
          {canCancel && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-850 border-b border-slate-800 text-sm font-medium">
          <button
            onClick={() => {
              setActiveTab('create');
              setErrorMessage(null);
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'create'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Facility</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('invites');
              setErrorMessage(null);
              loadPendingInvites();
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'invites'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MailCheck className="w-4 h-4" />
            <span>
              Pending Invites {pendingInvites.length > 0 && `(${pendingInvites.length})`}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-slate-200">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-sm flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-sm flex items-start space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          {activeTab === 'create' ? (
            <form onSubmit={handleCreateFarm} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Organization / Business Name
                </label>
                <input
                  type="text"
                  value={farmNameInput}
                  onChange={(e) => {
                    setFarmNameInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g., Sunrise Dehydrated Botanicals, Artisan Pickles Co."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition"
                  disabled={isSubmitting}
                  autoFocus
                />
                <p className="text-xs text-slate-400">
                  Must be unique across all businesses. You will become the founding Admin.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="flex items-center space-x-1.5 font-medium text-slate-300">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Founding Admin Role Binding</span>
                </div>
                <p>
                  Your account ({user.email}) will be assigned the <strong>Admin</strong> tier with full permissions to invite team members, define products, and mark production batches ready.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !farmNameInput.trim()}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-900/40"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Checking availability &amp; creating...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Create Organization</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Invitations sent to <strong className="text-slate-200">{user.email}</strong>:
              </p>

              {isLoadingInvites ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">Checking for pending invitations...</span>
                </div>
              ) : pendingInvites.length === 0 ? (
                <div className="py-8 text-center bg-slate-950/50 rounded-xl border border-dashed border-slate-800 p-6">
                  <MailCheck className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-300 font-medium">No pending invitations found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ask an existing facility administrator to send an invite to {user.email}, or create a new organization above.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.farmId}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                    >
                      <div>
                        <h4 className="font-bold text-white text-sm">
                          {invite.farmName || 'Production Facility'}
                        </h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs">
                            <UserCheck className="w-3 h-3" />
                            <span>Role: {invite.roleLabel}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs uppercase font-mono">
                            Tier: {invite.permissionTier}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAcceptInvite(invite)}
                        disabled={acceptingInviteFarmId === invite.farmId}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition flex items-center justify-center space-x-1.5 shrink-0"
                      >
                        {acceptingInviteFarmId === invite.farmId ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Accepting...</span>
                          </>
                        ) : (
                          <span>Accept &amp; Join</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
