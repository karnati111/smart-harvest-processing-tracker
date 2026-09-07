import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, PREVIEW_USER } from './lib/firebase';
import {
  Farm,
  FarmMember,
  ProductCatalogItem,
  HarvestLog,
  ProductionBatch,
} from './types';
import {
  getUserFarms,
  getProducts,
  getHarvestLogs,
  getBatches,
} from './lib/farmService';

import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { WalkthroughModal } from './components/WalkthroughModal';
import { DashboardSection } from './components/DashboardSection';
import { CatalogSection } from './components/CatalogSection';
import { IntakeSection } from './components/IntakeSection';
import { BatchSection } from './components/BatchSection';
import { TeamSection } from './components/TeamSection';
import { HistorySection } from './components/HistorySection';
import { PackagingSection } from './components/PackagingSection';
import { DispatchSection } from './components/DispatchSection';
import { PackagingRecord } from './types';

import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  Layers,
  Users,
  History,
  Loader2,
  Building2,
  Plus,
  Package,
  Truck,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Facility / Organization states
  const [allFarms, setAllFarms] = useState<Array<{ farm: Farm; member: FarmMember }>>([]);
  const [activeFarm, setActiveFarm] = useState<Farm | null>(null);
  const [activeMember, setActiveMember] = useState<FarmMember | null>(null);
  const [isFarmLoading, setIsFarmLoading] = useState(false);

  // App Data states
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [harvestLogs, setHarvestLogs] = useState<HarvestLog[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [isDataRefreshing, setIsDataRefreshing] = useState(false);

  // Navigation & Modals
  const [activeTab, setActiveTab] = useState<'dashboard' | 'batches' | 'intake' | 'catalog' | 'packaging' | 'dispatch' | 'team' | 'history'>('dashboard');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showWalkthroughModal, setShowWalkthroughModal] = useState(false);

  // Cross-tab workflows
  const [preselectedProductForIntake, setPreselectedProductForIntake] = useState<ProductCatalogItem | null>(null);
  const [preselectedLogsForBatch, setPreselectedLogsForBatch] = useState<HarvestLog[]>([]);
  const [preselectedProductForBatch, setPreselectedProductForBatch] = useState<ProductCatalogItem | null>(null);
  const [preselectedPackagingForDispatch, setPreselectedPackagingForDispatch] = useState<PackagingRecord | null>(null);
  const [focusedBatchId, setFocusedBatchId] = useState<string | null>(null);

  // Auto-route workers to their dedicated harvest-logging view
  useEffect(() => {
    if (activeMember && activeMember.permissionTier === 'worker') {
      if (activeTab === 'dashboard' || activeTab === 'batches' || activeTab === 'team') {
        setActiveTab('intake');
      }
    }
  }, [activeMember, activeTab]);

  // 1. Listen for Auth State Changes
  useEffect(() => {
    // Check if user previously launched preview mode
    const isPreview = localStorage.getItem('smart_harvest_preview_session') === 'true';
    if (isPreview) {
      setCurrentUser(PREVIEW_USER as unknown as User);
      setIsAuthLoading(false);
      loadUserOrganizations(PREVIEW_USER.uid);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Don't override preview user if preview session is active
      if (localStorage.getItem('smart_harvest_preview_session') === 'true') {
        return;
      }
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (user) {
        loadUserOrganizations(user.uid);
      } else {
        setAllFarms([]);
        setActiveFarm(null);
        setActiveMember(null);
        setProducts([]);
        setHarvestLogs([]);
        setBatches([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user?: User) => {
    const active = user || auth.currentUser || (PREVIEW_USER as unknown as User);
    setCurrentUser(active);
    setIsAuthLoading(false);
    loadUserOrganizations(active.uid);
  };

  const handlePreviewLogin = () => {
    localStorage.setItem('smart_harvest_preview_session', 'true');
    setCurrentUser(PREVIEW_USER as unknown as User);
    setIsAuthLoading(false);
    loadUserOrganizations(PREVIEW_USER.uid);
  };

  // 2. Load User's Organizations / Facilities
  const loadUserOrganizations = async (uid: string, selectFarmId?: string) => {
    setIsFarmLoading(true);
    try {
      const farmsList = await getUserFarms(uid);
      setAllFarms(farmsList);

      if (farmsList.length === 0) {
        // User has no facility membership -> show onboarding modal
        setActiveFarm(null);
        setActiveMember(null);
        setShowOnboardingModal(true);
      } else {
        // Pick target farm or first farm
        const selected = selectFarmId
          ? farmsList.find((f) => f.farm.id === selectFarmId) || farmsList[0]
          : farmsList[0];

        setActiveFarm(selected.farm);
        setActiveMember(selected.member);
        setShowOnboardingModal(false);

        // Load farm data
        await loadFarmData(selected.farm.id);
      }
    } catch (err) {
      console.error('Failed to load user organizations:', err);
    } finally {
      setIsFarmLoading(false);
    }
  };

  // 3. Load all operational data for active facility
  const loadFarmData = useCallback(async (farmId: string, currentMember?: FarmMember | null) => {
    setIsDataRefreshing(true);
    try {
      const memberToUse = currentMember !== undefined ? currentMember : activeMember;
      const [prodsData, logsData, batchesData] = await Promise.all([
        getProducts(farmId),
        getHarvestLogs(farmId, memberToUse?.uid, memberToUse?.permissionTier),
        getBatches(farmId),
      ]);
      setProducts(prodsData);
      setHarvestLogs(logsData);
      setBatches(batchesData);
    } catch (err) {
      console.error('Error loading facility data:', err);
    } finally {
      setIsDataRefreshing(false);
    }
  }, [activeMember]);

  const handleSelectFarm = (farm: Farm, member: FarmMember) => {
    setActiveFarm(farm);
    setActiveMember(member);
    loadFarmData(farm.id, member);
  };

  const handleFarmCreatedOrJoined = (farm: Farm, member: FarmMember) => {
    setAllFarms((prev) => [...prev, { farm, member }]);
    setActiveFarm(farm);
    setActiveMember(member);
    loadFarmData(farm.id, member);
  };

  // Handlers for dynamic data updates
  const handleProductAdded = (newProd: ProductCatalogItem) => {
    setProducts((prev) => [newProd, ...prev]);
  };

  const handleProductUpdated = (updatedProd: ProductCatalogItem) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProd.id ? updatedProd : p))
    );
    if (activeFarm) {
      loadFarmData(activeFarm.id);
    }
  };

  const handleLogAdded = (newLog: HarvestLog) => {
    setHarvestLogs((prev) => [newLog, ...prev]);
  };

  const handleLogUpdated = (updatedLog: HarvestLog) => {
    setHarvestLogs((prev) =>
      prev.map((l) => (l.id === updatedLog.id ? updatedLog : l))
    );
    if (activeFarm) {
      loadFarmData(activeFarm.id);
    }
  };

  const handleBatchCreated = (newBatch: ProductionBatch) => {
    setBatches((prev) => [newBatch, ...prev]);
    if (activeFarm) {
      loadFarmData(activeFarm.id);
    }
  };

  const handleBatchUpdated = (updatedBatch: ProductionBatch) => {
    setBatches((prev) =>
      prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b))
    );
    if (activeFarm) {
      loadFarmData(activeFarm.id);
    }
  };

  // Cross-section navigation helpers
  const handleSelectBatchFromIntake = (batchId: string) => {
    setFocusedBatchId(batchId);
    setActiveTab('batches');
  };

  const handleQuickIntakeFromCatalog = (product: ProductCatalogItem) => {
    setPreselectedProductForIntake(product);
    setActiveTab('intake');
  };

  const handleStartBatchFromLogs = (selectedLogs: HarvestLog[], product: ProductCatalogItem) => {
    setPreselectedLogsForBatch(selectedLogs);
    setPreselectedProductForBatch(product);
    setActiveTab('batches');
  };

  const handleDashboardQuickIntake = (product?: ProductCatalogItem) => {
    if (product) {
      setPreselectedProductForIntake(product);
    }
    setActiveTab('intake');
  };

  const handleDashboardStartBatchWithProduct = (product: ProductCatalogItem) => {
    setPreselectedProductForBatch(product);
    setActiveTab('batches');
  };

  const handleDashboardSelectBatch = (batchId: string) => {
    setFocusedBatchId(batchId);
    setActiveTab('batches');
  };

  // Loading Screen while Firebase initializes
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-3 text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Connecting to Firebase...</p>
      </div>
    );
  }

  // Not signed in -> show Google login screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} onPreviewLogin={handlePreviewLogin} />;
  }

  // Signed in but loading farm data
  if (isFarmLoading && !activeFarm) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-3 text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Checking facility memberships &amp; access rules...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* App Header */}
      <Header
        user={currentUser}
        activeFarm={activeFarm}
        activeMember={activeMember}
        allFarms={allFarms}
        onSelectFarm={handleSelectFarm}
        onOpenOnboarding={() => setShowOnboardingModal(true)}
        onOpenWalkthrough={() => setShowWalkthroughModal(true)}
        onRefreshData={() => activeFarm && loadFarmData(activeFarm.id)}
        isRefreshing={isDataRefreshing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* If user has no active farm yet, show onboarding placeholder */}
        {!activeFarm ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-md mx-auto shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                No Active Facility Joined
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                You are signed in as <strong className="text-slate-700 dark:text-slate-200">{currentUser.email}</strong>. Create a facility to become its Admin, or accept a pending invitation.
              </p>
            </div>
            <button
              onClick={() => setShowOnboardingModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow transition"
            >
              Open Organization Setup
            </button>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            {activeMember?.permissionTier === 'admin' ? (
              <div className="flex items-center space-x-1 sm:space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'dashboard'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Admin Dashboard</span>
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                    ADMIN
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('batches')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'batches'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Boxes className="w-4 h-4" />
                  <span>Production Batches ({batches.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('intake')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'intake'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Raw Material Intake ({harvestLogs.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('packaging')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'packaging'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Packaging &amp; Storage</span>
                </button>

                <button
                  onClick={() => setActiveTab('dispatch')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'dispatch'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  <span>Dispatching</span>
                </button>

                <button
                  onClick={() => setActiveTab('catalog')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'catalog'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Product Catalog ({products.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'history'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Operational History</span>
                </button>

                <button
                  onClick={() => setActiveTab('team')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'team'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Team &amp; Access</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1 sm:space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('intake')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'intake'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>My Raw Material Intake ({harvestLogs.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('packaging')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'packaging'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Packaging &amp; Storage</span>
                </button>

                <button
                  onClick={() => setActiveTab('dispatch')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'dispatch'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  <span>Dispatching</span>
                </button>

                <button
                  onClick={() => setActiveTab('catalog')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'catalog'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Product Catalog ({products.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                    activeTab === 'history'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-850'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Delivery History</span>
                </button>
              </div>
            )}

            {/* Active Tab View */}
            <div>
              {activeTab === 'dashboard' && (
                <DashboardSection
                  farm={activeFarm}
                  member={activeMember!}
                  products={products}
                  harvestLogs={harvestLogs}
                  batches={batches}
                  onNavigateTab={setActiveTab}
                  onQuickIntake={handleDashboardQuickIntake}
                  onStartBatchWithProduct={handleDashboardStartBatchWithProduct}
                  onSelectBatch={handleDashboardSelectBatch}
                  onBatchUpdated={handleBatchUpdated}
                />
              )}

              {activeTab === 'batches' && (
                <BatchSection
                  farmId={activeFarm.id}
                  farmName={activeFarm.name}
                  user={currentUser}
                  member={activeMember!}
                  products={products}
                  harvestLogs={harvestLogs}
                  batches={batches}
                  onBatchCreated={handleBatchCreated}
                  onBatchUpdated={handleBatchUpdated}
                  preselectedProduct={preselectedProductForBatch}
                  preselectedLogs={preselectedLogsForBatch}
                  onClearPreselection={() => {
                    setPreselectedProductForBatch(null);
                    setPreselectedLogsForBatch([]);
                  }}
                  onNavigateTab={setActiveTab}
                  focusedBatchId={focusedBatchId}
                  onClearFocusedBatch={() => setFocusedBatchId(null)}
                />
              )}

              {activeTab === 'intake' && (
                <IntakeSection
                  farmId={activeFarm.id}
                  user={currentUser}
                  member={activeMember!}
                  products={products}
                  harvestLogs={harvestLogs}
                  batches={batches}
                  onLogAdded={handleLogAdded}
                  onLogUpdated={handleLogUpdated}
                  onProductAdded={handleProductAdded}
                  onStartBatchWithLogs={handleStartBatchFromLogs}
                  preselectedProduct={preselectedProductForIntake}
                  onSelectBatch={handleSelectBatchFromIntake}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'packaging' && (
                <PackagingSection
                  farmId={activeFarm.id}
                  user={currentUser}
                  member={activeMember!}
                  products={products}
                  batches={batches}
                  onNavigateTab={setActiveTab}
                  onSelectForDispatch={(record) => {
                    setPreselectedPackagingForDispatch(record);
                    setActiveTab('dispatch');
                  }}
                />
              )}

              {activeTab === 'dispatch' && (
                <DispatchSection
                  farmId={activeFarm.id}
                  user={currentUser}
                  member={activeMember!}
                  products={products}
                  preselectedPackaging={preselectedPackagingForDispatch}
                  onClearPreselectedPackaging={() => setPreselectedPackagingForDispatch(null)}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'catalog' && (
                <CatalogSection
                  farmId={activeFarm.id}
                  member={activeMember!}
                  products={products}
                  onProductAdded={handleProductAdded}
                  onProductUpdated={handleProductUpdated}
                  onQuickIntake={handleQuickIntakeFromCatalog}
                />
              )}

              {activeTab === 'history' && (
                <HistorySection
                  farmId={activeFarm.id}
                  user={currentUser}
                  member={activeMember!}
                  products={products}
                  harvestLogs={harvestLogs}
                  batches={batches}
                />
              )}

              {activeTab === 'team' && (
                <TeamSection
                  farmId={activeFarm.id}
                  user={currentUser}
                  member={activeMember!}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* Onboarding & Facility Setup Modal */}
      <OnboardingModal
        user={currentUser}
        isOpen={showOnboardingModal}
        canCancel={!!activeFarm}
        onClose={() => setShowOnboardingModal(false)}
        onFarmSelected={handleFarmCreatedOrJoined}
      />

      {/* Step-by-Step QA Walkthrough Modal */}
      <WalkthroughModal
        isOpen={showWalkthroughModal}
        onClose={() => setShowWalkthroughModal(false)}
      />
    </div>
  );
}
