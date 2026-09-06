import React from 'react';
import { User } from 'firebase/auth';
import { Farm, FarmMember } from '../types';
import { logoutUser } from '../lib/firebase';
import {
  Factory,
  LogOut,
  ShieldCheck,
  UserCheck,
  Building2,
  ChevronDown,
  BookOpenCheck,
  RefreshCw,
} from 'lucide-react';

interface HeaderProps {
  user: User;
  activeFarm: Farm | null;
  activeMember: FarmMember | null;
  allFarms: Array<{ farm: Farm; member: FarmMember }>;
  onSelectFarm: (farm: Farm, member: FarmMember) => void;
  onOpenOnboarding: () => void;
  onOpenWalkthrough: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeFarm,
  activeMember,
  allFarms,
  onSelectFarm,
  onOpenOnboarding,
  onOpenWalkthrough,
  onRefreshData,
  isRefreshing,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Active Facility */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                  Smart Harvest &amp; Processing Tracker
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Gemini 3.6 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Dynamic Small-Batch Production &amp; Intake Platform
              </p>
            </div>
          </div>

          {/* Center/Right: Facility Switcher, Role Pills & User Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Facility Selector */}
            {activeFarm && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg text-sm font-medium transition text-slate-200"
                  title="Switch Organization / Facility"
                >
                  <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="max-w-[120px] sm:max-w-[180px] truncate">
                    {activeFarm.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                      Organizations ({allFarms.length})
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {allFarms.map(({ farm, member }) => (
                        <button
                          key={farm.id}
                          onClick={() => {
                            onSelectFarm(farm, member);
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-800 transition ${
                            farm.id === activeFarm.id
                              ? 'text-emerald-400 font-medium bg-slate-800/50'
                              : 'text-slate-300'
                          }`}
                        >
                          <span className="truncate">{farm.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-850 text-slate-400">
                            {member.roleLabel || member.permissionTier}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-slate-800 px-2">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          onOpenOnboarding();
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-emerald-400 hover:bg-emerald-950/40 rounded transition flex items-center space-x-1.5"
                      >
                        <span>+ Add / Join Facility</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refresh Data Button */}
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Test Walkthrough Button */}
            <button
              onClick={onOpenWalkthrough}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-medium text-slate-300 transition"
              title="View Test Walkthrough & QA Specs"
            >
              <BookOpenCheck className="w-4 h-4 text-amber-400" />
              <span className="hidden lg:inline">Test Walkthrough</span>
            </button>

            {/* Active Role Badges */}
            {activeMember && (
              <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-xs">
                {activeMember.permissionTier === 'admin' ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span
                  className={
                    activeMember.permissionTier === 'admin'
                      ? 'font-semibold text-emerald-400'
                      : 'font-semibold text-sky-400'
                  }
                >
                  {activeMember.roleLabel || (activeMember.permissionTier === 'admin' ? 'Admin' : 'Worker')}
                </span>
                <span className="text-slate-500">•</span>
                <span className="uppercase text-[10px] tracking-wider text-slate-400 font-mono">
                  {activeMember.permissionTier}
                </span>
              </div>
            )}

            {/* User Avatar & Logout */}
            <div className="flex items-center space-x-2 pl-1 sm:pl-2 border-l border-slate-800">
              <div
                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 uppercase overflow-hidden border border-slate-600"
                title={user.email || user.displayName || 'User'}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  (user.displayName || user.email || 'U')[0]
                )}
              </div>

              <button
                onClick={() => logoutUser()}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
