import React, { useState } from 'react';
import { ProductCatalogItem, FarmMember } from '../types';
import { addProduct, updateProduct } from '../lib/farmService';
import { cleanUnit, formatUnitDisplay } from '../lib/unitUtils';
import {
  PackagePlus,
  Boxes,
  Search,
  Sparkles,
  Loader2,
  Tag,
  Scale,
  Cog,
  CheckCircle2,
  AlertCircle,
  Plus,
  Pencil,
} from 'lucide-react';

interface CatalogSectionProps {
  farmId: string;
  member: FarmMember;
  products: ProductCatalogItem[];
  onProductAdded: (newProd: ProductCatalogItem) => void;
  onProductUpdated?: (updatedProd: ProductCatalogItem) => void;
  onQuickIntake: (product: ProductCatalogItem) => void;
}

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  farmId,
  member,
  products,
  onProductAdded,
  onProductUpdated,
  onQuickIntake,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states (Add)
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [processingType, setProcessingType] = useState('drying');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit Modal states
  const [editingProduct, setEditingProduct] = useState<ProductCatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('kg');
  const [editProcessingType, setEditProcessingType] = useState('drying');
  const [isEditing, setIsEditing] = useState(false);

  const startEditProduct = (prod: ProductCatalogItem) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    setEditUnit(cleanUnit(prod.unit));
    setEditProcessingType(prod.processingType || 'drying');
    setFeedback(null);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setFeedback({ type: 'error', message: 'Product name cannot be empty.' });
      return;
    }

    setIsEditing(true);
    try {
      const sanitizedUnit = cleanUnit(editUnit) || 'kg';
      const updated = await updateProduct(farmId, editingProduct.id, {
        name: trimmedName,
        unit: sanitizedUnit,
        processingType: editProcessingType.trim() || 'processing',
      });
      if (onProductUpdated) {
        onProductUpdated(updated);
      }
      setFeedback({
        type: 'success',
        message: `Updated product "${updated.name}" successfully (Unit: ${formatUnitDisplay(updated.unit)}).`,
      });
      setEditingProduct(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to update product.',
      });
    } finally {
      setIsEditing(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.processingType.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q)
    );
  });

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFeedback({ type: 'error', message: 'Product name is required.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const sanitizedUnit = cleanUnit(unit) || 'kg';
      const newProduct = await addProduct(
        farmId,
        trimmedName,
        sanitizedUnit,
        processingType.trim() || 'processing',
        member.uid
      );
      onProductAdded(newProduct);
      setFeedback({
        type: 'success',
        message: `Added "${newProduct.name}" to dynamic product catalog (Unit: ${formatUnitDisplay(newProduct.unit)}).`,
      });
      setName('');
      setShowAddForm(false);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to add product to catalog.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const commonProcessingTypes = [
    'drying',
    'fermenting',
    'grinding',
    'packaging',
    'curing',
    'pressing',
    'roasting',
  ];

  const commonUnits = ['kg', 'g', 'l', 'pieces', 'bundles', 'trays'];

  return (
    <div className="space-y-6">
      {/* Header with Search & Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Boxes className="w-5 h-5 text-emerald-500" />
            <span>Dynamic Product Catalog</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Universal specification for dehydrated produce, ferments, ground spices, and doughs
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search products or process..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setFeedback(null);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
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

      {/* Add Product Form Drawer */}
      {showAddForm && (
        <div className="bg-slate-50 dark:bg-slate-850 p-5 rounded-xl border border-emerald-500/40 dark:border-emerald-500/30 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-2 text-sm font-bold text-slate-800 dark:text-white">
              <PackagePlus className="w-4 h-4 text-emerald-500" />
              <span>Define New Raw Material / Finished Good</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Any team member can expand the catalog
            </span>
          </div>

          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Product Name */}
              <div className="space-y-1 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product / Crop Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Moringa Leaves, Mango Pickle Mix"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Unit */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Standard Unit
                </label>
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    placeholder="kg, g, l, pieces"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value.replace(/[\d\.\,\-]+/g, ''))}
                    onBlur={() => setUnit(cleanUnit(unit))}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {commonUnits.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                        unit === u
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Processing Type */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Processing Type
                </label>
                <input
                  type="text"
                  placeholder="e.g. drying, fermenting, grinding"
                  value={processingType}
                  onChange={(e) => setProcessingType(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {commonProcessingTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProcessingType(t)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition capitalize ${
                        processingType.toLowerCase() === t
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save to Catalog</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8">
          <Boxes className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {searchTerm ? 'No matching products found' : 'Product catalog is empty'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Add custom products for drying, fermenting, grinding, or packaging to track your production.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition"
          >
            + Add First Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((prod) => (
            <div
              key={prod.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 rounded-xl p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
                    {prod.name}
                  </h3>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 uppercase tracking-wider">
                    <Cog className="w-2.5 h-2.5" />
                    <span>{prod.processingType}</span>
                  </span>
                </div>

                <div className="flex items-center space-x-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Scale className="w-3.5 h-3.5 text-slate-400" />
                    <span>Unit: <strong className="text-slate-700 dark:text-slate-200">{formatUnitDisplay(prod.unit)}</strong></span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Type: <strong className="text-slate-700 dark:text-slate-200 capitalize">{prod.processingType}</strong></span>
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => startEditProduct(prod)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                  title="Edit product name, unit, or processing type"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => onQuickIntake(prod)}
                  className="px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition flex items-center space-x-1 border border-emerald-200 dark:border-emerald-900 shadow-xs"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Log Intake</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Edit Catalog Item
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Update product details, correct typos, and standardize units
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Standard Measurement Unit *
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Standard unit without numbers (e.g. "kg", not "100kg")
                  </span>
                </div>
                <input
                  type="text"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value.replace(/[\d\.\,\-]+/g, ''))}
                  onBlur={() => setEditUnit(cleanUnit(editUnit))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. kg, g, l, pieces, bundles"
                  required
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {commonUnits.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setEditUnit(u)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        editUnit.toLowerCase() === u
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Processing Type *
                </label>
                <input
                  type="text"
                  value={editProcessingType}
                  onChange={(e) => setEditProcessingType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {commonProcessingTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditProcessingType(t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        editProcessingType.toLowerCase() === t
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing || !editName.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
